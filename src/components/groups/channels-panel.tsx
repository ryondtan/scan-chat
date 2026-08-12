import { errMsg } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/chat/avatar";
import type { Message, Profile } from "@/lib/chat-api";
import { attachmentSignedUrl, addReaction, removeReaction, togglePin, deleteMessage } from "@/lib/chat-api";
import {
  listChannels,
  createChannel,
  deleteChannel,
  getChannelMessages,
  sendChannelMessage,
  uploadChannelAttachment,
  searchChannelMessages,
  getProfilesByIds,
  type Channel,
} from "@/lib/channels-api";
import type { GroupMember } from "@/lib/groups-types";
import { VoiceRoom } from "@/components/groups/voice-room";
import {
  Hash,
  Volume2,
  Plus,
  Send,
  Paperclip,
  Search,
  Pin,
  Reply,
  Trash2,
  X,
  SmilePlus,
  Loader2,
} from "lucide-react";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "🤔", "👀"];
type Status = "online" | "away" | "offline";

export function ChannelsPanel({
  groupId,
  members,
  isAdmin,
  myId,
}: {
  groupId: string;
  members: GroupMember[];
  isAdmin: boolean;
  myId: string;
}) {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [presence, setPresence] = useState<Record<string, Status>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Message[] | null>(null);

  const load = useCallback(async () => {
    const list = await listChannels(groupId);
    setChannels(list);
    setActiveId((prev) => prev ?? list.find((c) => c.type === "text")?.id ?? null);
  }, [groupId]);

  useEffect(() => {
    load().catch((e) => toast.error(errMsg(e)));
  }, [load]);

  // Presence across the whole group
  useEffect(() => {
    const ch = supabase.channel(`group-presence:${groupId}`, { config: { presence: { key: myId } } });
    const sync = () => {
      const state = ch.presenceState<{ status: Status }>();
      const next: Record<string, Status> = {};
      Object.entries(state).forEach(([uid, metas]) => {
        next[uid] = (metas[metas.length - 1]?.status as Status) ?? "online";
      });
      setPresence(next);
    };
    ch.on("presence", { event: "sync" }, sync).subscribe(async (s) => {
      if (s === "SUBSCRIBED") await ch.track({ status: document.hidden ? "away" : "online" });
    });
    const onVis = () => ch.track({ status: document.hidden ? "away" : "online" });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(ch);
    };
  }, [groupId, myId]);

  // Live channel list updates
  useEffect(() => {
    const ch = supabase
      .channel(`group-channels:${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_channels", filter: `group_id=eq.${groupId}` }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, load]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return setResults(null);
    try {
      setResults(await searchChannelMessages(groupId, query));
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const active = channels?.find((c) => c.id === activeId) ?? null;
  const online = members.filter((m) => (presence[m.user_id] ?? "offline") !== "offline").length;

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr] min-h-[560px]">
      <ChannelSidebar
        channels={channels}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setResults(null);
        }}
        groupId={groupId}
        isAdmin={isAdmin}
        onChanged={load}
        online={online}
        total={members.length}
      />

      <div className="rounded-xl border bg-card flex flex-col min-h-[560px] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b">
          {active?.type === "voice" ? <Volume2 className="w-4 h-4 text-muted-foreground" /> : <Hash className="w-4 h-4 text-muted-foreground" />}
          <span className="font-semibold text-sm truncate">{active?.name ?? "No channel"}</span>
          <form onSubmit={runSearch} className="ml-auto relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value) setResults(null);
              }}
              placeholder="Search messages"
              className="pl-7 pr-2 py-1.5 text-xs rounded-md bg-input w-40 sm:w-56 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </form>
        </div>

        {results ? (
          <SearchResults results={results} channels={channels ?? []} onClose={() => { setResults(null); setQuery(""); }} />
        ) : active?.type === "voice" ? (
          <VoiceRoom key={active.id} channelId={active.id} channelName={active.name} myId={myId} />
        ) : active ? (
          <ChannelChat key={active.id} channel={active} myId={myId} members={members} presence={presence} />
        ) : (
          <div className="flex-1 grid place-items-center text-sm text-muted-foreground">Select a channel</div>
        )}
      </div>
    </div>
  );
}

function ChannelSidebar({
  channels,
  activeId,
  onSelect,
  groupId,
  isAdmin,
  onChanged,
  online,
  total,
}: {
  channels: Channel[] | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  groupId: string;
  isAdmin: boolean;
  onChanged: () => void;
  online: number;
  total: number;
}) {
  const [adding, setAdding] = useState<null | "text" | "voice">(null);
  const [name, setName] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adding || !name.trim()) return;
    try {
      const c = await createChannel(groupId, name, adding);
      setName("");
      setAdding(null);
      onChanged();
      onSelect(c.id);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const section = (type: "text" | "voice", label: string) => (
    <div className="mb-4">
      <div className="flex items-center justify-between px-2 mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <button onClick={() => setAdding(adding === type ? null : type)} className="p-1 rounded hover:bg-accent" aria-label={`Add ${label}`}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {adding === type && (
        <form onSubmit={add} className="px-2 mb-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === "text" ? "new-channel" : "Study Room"}
            className="w-full px-2 py-1.5 text-xs rounded-md bg-input focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>
      )}
      <ul className="space-y-0.5">
        {(channels ?? []).filter((c) => c.type === type).map((c) => (
          <li key={c.id} className="group/ch flex items-center">
            <button
              onClick={() => onSelect(c.id)}
              className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm truncate text-left ${
                activeId === c.id ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              {type === "text" ? <Hash className="w-3.5 h-3.5 shrink-0" /> : <Volume2 className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate">{c.name}</span>
            </button>
            {isAdmin && (
              <button
                onClick={async () => {
                  if (!confirm(`Delete #${c.name}?`)) return;
                  await deleteChannel(c.id);
                  onChanged();
                }}
                className="opacity-0 group-hover/ch:opacity-100 p-1 rounded hover:bg-destructive/10 text-destructive"
                aria-label="Delete channel"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <aside className="rounded-xl border bg-card p-2">
      <div className="px-2 py-2 mb-2 text-xs text-muted-foreground flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        {online} of {total} online
      </div>
      {channels === null ? (
        <div className="px-2 py-4 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {section("text", "Text channels")}
          {section("voice", "Voice channels")}
        </>
      )}
    </aside>
  );
}

function SearchResults({ results, channels, onClose }: { results: Message[]; channels: Channel[]; onClose: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{results.length} result{results.length === 1 ? "" : "s"}</span>
        <button onClick={onClose} className="inline-flex items-center gap-1 hover:text-foreground">
          <X className="w-3 h-3" /> Clear
        </button>
      </div>
      {results.map((m) => (
        <div key={m.id} className="rounded-lg border p-3 text-sm">
          <div className="text-[11px] text-muted-foreground mb-1">
            #{channels.find((c) => c.id === (m as Message & { channel_id?: string }).channel_id)?.name ?? "channel"} ·{" "}
            {new Date(m.created_at).toLocaleString()}
          </div>
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
        </div>
      ))}
      {results.length === 0 && <p className="text-sm text-muted-foreground pt-6 text-center">No matches.</p>}
    </div>
  );
}

function ChannelChat({
  channel,
  myId,
  members,
  presence,
}: {
  channel: Channel;
  myId: string;
  members: GroupMember[];
  presence: Record<string, Status>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = useCallback(async () => {
    const rows = await getChannelMessages(channel.id);
    setMessages(rows);
    const ids = Array.from(new Set(rows.map((r) => r.sender_id)));
    setProfiles(await getProfilesByIds(ids));
  }, [channel.id]);

  useEffect(() => {
    refresh().catch((e) => toast.error(errMsg(e)));
  }, [refresh]);

  useEffect(() => {
    const ch = supabase
      .channel(`channel:${channel.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => refresh())
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const uid = payload?.user_id as string;
        if (!uid || uid === myId) return;
        setTyping((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
        setTimeout(() => setTyping((prev) => prev.filter((x) => x !== uid)), 3000);
      })
      .subscribe();
    typingChannelRef.current = ch;
    return () => {
      typingChannelRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [channel.id, myId, refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const nameOf = useCallback(
    (uid: string) => profiles[uid]?.display_name ?? members.find((m) => m.user_id === uid)?.profile?.display_name ?? "Member",
    [profiles, members],
  );

  const pinned = useMemo(() => messages.filter((m) => m.pinned_at), [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      await sendChannelMessage(channel.id, { content: body, reply_to_id: replyTo?.id ?? null });
      setReplyTo(null);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err));
      setText(body);
    } finally {
      setSending(false);
    }
  };

  const onFile = async (file: File) => {
    try {
      const att = await uploadChannelAttachment(channel.id, file);
      await sendChannelMessage(channel.id, { attachment: att, reply_to_id: replyTo?.id ?? null });
      setReplyTo(null);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <>
      {pinned.length > 0 && (
        <div className="border-b bg-muted/40 px-4 py-2">
          <button onClick={() => setShowPins((v) => !v)} className="text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <Pin className="w-3 h-3" /> {pinned.length} pinned
          </button>
          {showPins && (
            <ul className="mt-2 space-y-1">
              {pinned.map((p) => (
                <li key={p.id} className="text-xs text-muted-foreground truncate">
                  <span className="font-medium text-foreground">{nameOf(p.sender_id)}:</span> {p.content ?? p.attachment_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">
            This is the start of #{channel.name}. Say hi.
          </p>
        )}
        {messages.map((m, i) => (
          <MessageRow
            key={m.id}
            message={m}
            prev={messages[i - 1] ?? null}
            myId={myId}
            profile={profiles[m.sender_id] ?? null}
            name={nameOf(m.sender_id)}
            status={presence[m.sender_id] ?? "offline"}
            onReply={() => setReplyTo(m)}
            onChanged={refresh}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t px-3 py-2">
        {typing.length > 0 && (
          <div className="text-[11px] text-muted-foreground pb-1 animate-pulse">
            {typing.map(nameOf).join(", ")} {typing.length === 1 ? "is" : "are"} typing…
          </div>
        )}
        {replyTo && (
          <div className="flex items-center gap-2 text-xs bg-muted rounded-md px-2 py-1.5 mb-2">
            <Reply className="w-3 h-3" />
            <span className="truncate flex-1">Replying to {nameOf(replyTo.sender_id)}: {replyTo.content ?? replyTo.attachment_name}</span>
            <button onClick={() => setReplyTo(null)}><X className="w-3 h-3" /></button>
          </div>
        )}
        <form onSubmit={send} className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className="p-2 rounded-lg hover:bg-accent text-muted-foreground" aria-label="Attach file">
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { user_id: myId } });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(e as unknown as React.FormEvent);
              }
            }}
            placeholder={`Message #${channel.name}`}
            className="flex-1 resize-none px-3 py-2 rounded-lg bg-input text-sm max-h-32 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="submit" disabled={!text.trim() || sending} className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </>
  );
}

function MessageRow({
  message,
  prev,
  myId,
  profile,
  name,
  status,
  onReply,
  onChanged,
}: {
  message: Message;
  prev: Message | null;
  myId: string;
  profile: Profile | null;
  name: string;
  status: Status;
  onReply: () => void;
  onChanged: () => void;
}) {
  const grouped =
    prev?.sender_id === message.sender_id &&
    new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
  const [showEmoji, setShowEmoji] = useState(false);

  const grouping = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    (message.reactions ?? []).forEach((r) => {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false };
      map.set(r.emoji, { count: cur.count + 1, mine: cur.mine || r.user_id === myId });
    });
    return Array.from(map.entries());
  }, [message.reactions, myId]);

  return (
    <div className={`group/msg flex gap-3 px-2 py-1 rounded-lg hover:bg-accent/30 ${grouped ? "" : "mt-3"}`}>
      <div className="w-9 shrink-0">
        {!grouped && (
          <div className="relative">
            <Avatar profile={profile ?? { display_name: name, username: name, avatar_url: null }} size={36} />
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                status === "online" ? "bg-emerald-500" : status === "away" ? "bg-amber-500" : "bg-muted-foreground/50"
              }`}
            />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{name}</span>
            <span className="text-[11px] text-muted-foreground">{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        )}
        {message.reply_to && (
          <div className="text-[11px] text-muted-foreground truncate border-l-2 pl-2 mb-0.5">
            {message.reply_to.content ?? message.reply_to.attachment_name}
          </div>
        )}
        {message.content && <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>}
        {message.attachment_url && <AttachmentView message={message} />}
        {grouping.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {grouping.map(([emoji, info]) => (
              <button
                key={emoji}
                onClick={async () => {
                  if (info.mine) await removeReaction(message.id, emoji);
                  else await addReaction(message.id, emoji);
                  onChanged();
                }}
                className={`text-xs px-1.5 py-0.5 rounded-full border ${info.mine ? "bg-primary/10 border-primary/40" : "bg-muted"}`}
              >
                {emoji} {info.count}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative opacity-0 group-hover/msg:opacity-100 flex items-start gap-0.5">
        <button onClick={() => setShowEmoji((v) => !v)} className="p-1 rounded hover:bg-accent" aria-label="React"><SmilePlus className="w-3.5 h-3.5" /></button>
        <button onClick={onReply} className="p-1 rounded hover:bg-accent" aria-label="Reply"><Reply className="w-3.5 h-3.5" /></button>
        <button
          onClick={async () => {
            await togglePin(message.id, !message.pinned_at);
            onChanged();
          }}
          className={`p-1 rounded hover:bg-accent ${message.pinned_at ? "text-primary" : ""}`}
          aria-label="Pin"
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
        {message.sender_id === myId && (
          <button
            onClick={async () => {
              await deleteMessage(message.id);
              onChanged();
            }}
            className="p-1 rounded hover:bg-accent text-destructive"
            aria-label="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {showEmoji && (
          <div className="absolute right-0 top-7 z-20 flex gap-1 bg-popover border rounded-lg p-1 shadow-md">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={async () => {
                  await addReaction(message.id, e);
                  setShowEmoji(false);
                  onChanged();
                }}
                className="text-base hover:scale-125 transition"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentView({ message }: { message: Message }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (message.attachment_url) attachmentSignedUrl(message.attachment_url).then(setUrl);
  }, [message.attachment_url]);
  if (!url) return <div className="text-xs text-muted-foreground mt-1">Loading attachment…</div>;
  if (message.attachment_type?.startsWith("image/")) {
    return <img src={url} alt={message.attachment_name ?? ""} className="mt-1 rounded-lg max-h-64 border" loading="lazy" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 text-sm underline text-primary">
      <Paperclip className="w-3.5 h-3.5" /> {message.attachment_name}
    </a>
  );
}
