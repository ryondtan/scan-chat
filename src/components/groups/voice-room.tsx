import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/chat/avatar";
import type { Profile } from "@/lib/chat-api";
import { getProfilesByIds } from "@/lib/channels-api";
import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Volume2,
  Loader2,
} from "lucide-react";

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] }],
};

type PeerInfo = { id: string; stream: MediaStream | null; screen: MediaStream | null };

export function VoiceRoom({
  channelId,
  channelName,
  myId,
}: {
  channelId: string;
  channelName: string;
  myId: string;
}) {
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [peers, setPeers] = useState<Record<string, PeerInfo>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [lobby, setLobby] = useState<string[]>([]);

  const localRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const senderRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const rtRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Lobby presence — see who is in the room before joining
  useEffect(() => {
    const ch = supabase.channel(`voice-lobby:${channelId}`, { config: { presence: { key: myId } } });
    const sync = () => setLobby(Object.keys(ch.presenceState()));
    ch.on("presence", { event: "sync" }, sync).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelId, myId]);

  useEffect(() => {
    const ids = Array.from(new Set([...lobby, ...Object.keys(peers), myId]));
    getProfilesByIds(ids).then(setProfiles).catch(() => {});
  }, [lobby, peers, myId]);

  const cleanup = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    senderRef.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    if (rtRef.current) supabase.removeChannel(rtRef.current);
    rtRef.current = null;
    setPeers({});
    setSharing(false);
    setJoined(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const signal = (to: string, payload: unknown) =>
    rtRef.current?.send({ type: "broadcast", event: "signal", payload: { from: myId, to, data: payload } });

  const createPeer = useCallback(
    (peerId: string) => {
      const existing = pcsRef.current.get(peerId);
      if (existing) return existing;
      const pc = new RTCPeerConnection(ICE);
      pcsRef.current.set(peerId, pc);

      localRef.current?.getTracks().forEach((t) => {
        const s = pc.addTrack(t, localRef.current!);
        if (t.kind === "audio") senderRef.current.set(peerId, s);
      });
      if (screenRef.current) screenRef.current.getTracks().forEach((t) => pc.addTrack(t, screenRef.current!));

      pc.onicecandidate = (e) => {
        if (e.candidate) signal(peerId, { candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0];
        const isVideo = e.track.kind === "video";
        setPeers((prev) => ({
          ...prev,
          [peerId]: {
            id: peerId,
            stream: isVideo ? prev[peerId]?.stream ?? null : stream,
            screen: isVideo ? stream : prev[peerId]?.screen ?? null,
          },
        }));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close();
          pcsRef.current.delete(peerId);
          setPeers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        }
      };
      setPeers((prev) => prev[peerId] ? prev : { ...prev, [peerId]: { id: peerId, stream: null, screen: null } });
      return pc;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myId],
  );

  const negotiate = useCallback(
    async (peerId: string) => {
      const pc = createPeer(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal(peerId, { sdp: pc.localDescription });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createPeer],
  );

  const join = async () => {
    if (connecting || joined) return;
    setConnecting(true);
    try {
      localRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setConnecting(false);
      toast.error("Microphone access is required to join the call.");
      return;
    }

    const rt = supabase.channel(`voice:${channelId}`, { config: { presence: { key: myId }, broadcast: { self: false } } });
    rtRef.current = rt;

    rt.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const { from, to, data } = (payload ?? {}) as { from: string; to: string; data: any };
      if (!from || to !== myId) return;
      const pc = createPeer(from);
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          if (data.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signal(from, { sdp: pc.localDescription });
          }
        } else if (data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (err) {
        console.error("voice signal error", err);
      }
    });

    rt.on("presence", { event: "join" }, ({ key }: { key: string }) => {
      if (key === myId) return;
      toast.message(`${profiles[key]?.display_name ?? "Someone"} joined ${channelName}`);
      // Deterministic initiator: lower id offers
      if (myId < key) negotiate(key);
    });

    rt.on("presence", { event: "leave" }, ({ key }: { key: string }) => {
      const pc = pcsRef.current.get(key);
      pc?.close();
      pcsRef.current.delete(key);
      setPeers((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.message(`${profiles[key]?.display_name ?? "Someone"} left ${channelName}`);
    });

    rt.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await rt.track({ joined_at: Date.now() });
      const others = Object.keys(rt.presenceState()).filter((k) => k !== myId);
      others.forEach((k) => {
        if (myId < k) negotiate(k);
        else createPeer(k);
      });
      setJoined(true);
      setConnecting(false);
    });
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  };

  const toggleDeafen = () => {
    const next = !deafened;
    setDeafened(next);
    if (next && !muted) toggleMute();
  };

  const toggleShare = async () => {
    if (sharing) {
      screenRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current = null;
      setSharing(false);
      pcsRef.current.forEach((_, id) => negotiate(id));
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenRef.current = s;
      setSharing(true);
      s.getVideoTracks()[0].onended = () => {
        screenRef.current = null;
        setSharing(false);
        pcsRef.current.forEach((_, id) => negotiate(id));
      };
      pcsRef.current.forEach((pc, id) => {
        s.getTracks().forEach((t) => pc.addTrack(t, s));
        negotiate(id);
      });
    } catch {
      /* user cancelled */
    }
  };

  const participants = joined ? [myId, ...Object.keys(peers)] : lobby;
  const screens = Object.values(peers).filter((p) => p.screen);

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-accent grid place-items-center mx-auto mb-3">
            <Volume2 className="w-6 h-6 text-accent-foreground" />
          </div>
          <p className="font-medium">{channelName}</p>
          <p className="text-sm text-muted-foreground">
            {participants.length === 0 ? "No one is here yet" : `${participants.length} in call`}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          {participants.map((uid) => (
            <div key={uid} className="flex flex-col items-center gap-1.5 w-24">
              <div className={`rounded-full p-0.5 ${uid === myId && !muted ? "ring-2 ring-emerald-500" : ""}`}>
                <Avatar profile={profiles[uid] ?? { display_name: "Member", username: "member", avatar_url: null }} size={56} />
              </div>
              <span className="text-xs truncate w-full text-center">
                {uid === myId ? "You" : profiles[uid]?.display_name ?? "Member"}
              </span>
              {uid === myId && muted && <MicOff className="w-3 h-3 text-destructive" />}
            </div>
          ))}
        </div>

        {screens.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {screens.map((p) => (
              <RemoteScreen key={p.id} stream={p.screen!} name={profiles[p.id]?.display_name ?? "Member"} />
            ))}
          </div>
        )}

        {joined &&
          Object.values(peers).map((p) => p.stream && <RemoteAudio key={p.id} stream={p.stream} muted={deafened} />)}
      </div>

      <div className="border-t p-3 flex items-center justify-center gap-2">
        {!joined ? (
          <button
            onClick={join}
            disabled={connecting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
            {connecting ? "Connecting…" : "Join call"}
          </button>
        ) : (
          <>
            <ControlButton onClick={toggleMute} active={muted} label={muted ? "Unmute" : "Mute"}>
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </ControlButton>
            <ControlButton onClick={toggleDeafen} active={deafened} label={deafened ? "Undeafen" : "Deafen"}>
              {deafened ? <HeadphoneOff className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
            </ControlButton>
            <ControlButton onClick={toggleShare} active={sharing} label={sharing ? "Stop sharing" : "Share screen"}>
              {sharing ? <MonitorX className="w-4 h-4" /> : <MonitorUp className="w-4 h-4" />}
            </ControlButton>
            <button
              onClick={cleanup}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm"
            >
              <PhoneOff className="w-4 h-4" /> Leave
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`p-2.5 rounded-lg border ${active ? "bg-destructive/10 text-destructive border-destructive/40" : "hover:bg-accent"}`}
    >
      {children}
    </button>
  );
}

function RemoteAudio({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline muted={muted} />;
}

function RemoteScreen({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="rounded-lg border overflow-hidden bg-black">
      <video ref={ref} autoPlay playsInline className="w-full" />
      <div className="text-xs px-2 py-1 bg-card">{name} is sharing</div>
    </div>
  );
}
