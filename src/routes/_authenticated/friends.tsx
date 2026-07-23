import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  getFriends, sendFriendRequest, QR_PREFIX,
  getIncomingRequests, getOutgoingRequests,
  acceptFriendRequest, declineFriendRequest, cancelFriendRequest,
} from "@/lib/chat-api";
import { Avatar } from "./chats";
import { toast } from "sonner";
import { UserPlus, ScanLine, X, Check } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

export const Route = createFileRoute("/_authenticated/friends")({
  ssr: false,
  component: FriendsPage,
});

function FriendsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: friends = [] } = useQuery({ queryKey: ["friends"], queryFn: getFriends });
  const { data: incoming = [] } = useQuery({ queryKey: ["friend-requests", "in"], queryFn: getIncomingRequests, refetchInterval: 10000 });
  const { data: outgoing = [] } = useQuery({ queryKey: ["friend-requests", "out"], queryFn: getOutgoingRequests });

  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["friends"] });
    qc.invalidateQueries({ queryKey: ["friend-requests", "in"] });
    qc.invalidateQueries({ queryKey: ["friend-requests", "out"] });
  };

  const handleAdd = async (uname: string) => {
    setAdding(true);
    try {
      const friend = await sendFriendRequest(uname);
      // Check if it was auto-accepted (they had sent us a request)
      const wasIncoming = incoming.some((r) => r.sender_id === friend.id);
      if (wasIncoming) {
        toast.success(`You're now friends with @${friend.username}`);
        refreshAll();
        setAddOpen(false); setUsername("");
        navigate({ to: "/chats/$friendId", params: { friendId: friend.id } });
      } else {
        toast.success(`Request sent to @${friend.username}`);
        refreshAll();
        setAddOpen(false); setUsername("");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setAdding(false); }
  };

  const handleScanned = (text: string) => {
    setScanOpen(false);
    const uname = text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length) : text;
    handleAdd(uname);
  };

  const handleAccept = async (id: string) => {
    try { await acceptFriendRequest(id); toast.success("Friend added"); refreshAll(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const handleDecline = async (id: string) => {
    try { await declineFriendRequest(id); refreshAll(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const handleCancel = async (id: string) => {
    try { await cancelFriendRequest(id); refreshAll(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <header className="px-5 py-4 border-b bg-card/50 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-2xl font-bold">Friends</h1>
        <div className="flex gap-2">
          <button onClick={() => setScanOpen(true)}
            className="p-2 rounded-full hover:bg-accent" aria-label="Scan QR"><ScanLine className="w-5 h-5" /></button>
          <button onClick={() => setAddOpen(true)}
            className="p-2 rounded-full hover:bg-accent" aria-label="Add friend"><UserPlus className="w-5 h-5" /></button>
        </div>
      </header>

      {incoming.length > 0 && (
        <section>
          <h2 className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Requests · {incoming.length}
          </h2>
          <ul className="divide-y">
            {incoming.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                {r.sender && <Avatar profile={r.sender} />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.sender?.display_name}</div>
                  <div className="text-sm text-muted-foreground truncate">wants to add you · @{r.sender?.username}</div>
                </div>
                <button onClick={() => handleAccept(r.id)}
                  className="p-2 rounded-full bg-primary text-primary-foreground" aria-label="Accept">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => handleDecline(r.id)}
                  className="p-2 rounded-full bg-muted hover:bg-accent" aria-label="Decline">
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h2 className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sent
          </h2>
          <ul className="divide-y">
            {outgoing.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                {r.recipient && <Avatar profile={r.recipient} />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.recipient?.display_name}</div>
                  <div className="text-sm text-muted-foreground truncate">Pending · @{r.recipient?.username}</div>
                </div>
                <button onClick={() => handleCancel(r.id)}
                  className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-accent">
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Friends · {friends.length}
        </h2>
        {friends.length === 0 ? (
          <div className="px-6 py-10 text-center text-muted-foreground text-sm">
            No friends yet. Scan a QR or add by username.
          </div>
        ) : (
          <ul className="divide-y">
            {friends.map((f) => (
              <li key={f.id}>
                <button onClick={() => navigate({ to: "/chats/$friendId", params: { friendId: f.id } })}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/40 text-left">
                  <Avatar profile={f} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{f.display_name}</div>
                    <div className="text-sm text-muted-foreground truncate">@{f.username}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {addOpen && (
        <Modal onClose={() => setAddOpen(false)} title="Send friend request">
          <form onSubmit={(e) => { e.preventDefault(); if (username.trim()) handleAdd(username); }} className="space-y-3">
            <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username" className="w-full px-3 py-2.5 rounded-lg bg-input text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={adding || !username.trim()}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {adding ? "Sending…" : "Send request"}
            </button>
          </form>
        </Modal>
      )}

      {scanOpen && <ScannerModal onClose={() => setScanOpen(false)} onResult={handleScanned} />}
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ScannerModal({ onClose, onResult }: { onClose: () => void; onResult: (t: string) => void }) {
  const divId = "qr-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(divId);
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decoded) => { scanner.stop().catch(() => {}); onResult(decoded); },
      () => {},
    ).catch((e) => setError(e instanceof Error ? e.message : "Camera unavailable"));
    return () => { scanner.stop().catch(() => {}); scanner.clear(); };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-semibold">Scan a friend's QR</span>
        <button onClick={onClose} className="p-1"><X className="w-6 h-6" /></button>
      </div>
      <div id={divId} className="flex-1" />
      {error && <div className="p-4 text-center text-sm text-white/80">{error}</div>}
    </div>
  );
}
