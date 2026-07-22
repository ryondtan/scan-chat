import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getFriends, addFriendByUsername, QR_PREFIX } from "@/lib/chat-api";
import { Avatar } from "./chats";
import { toast } from "sonner";
import { UserPlus, ScanLine, X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

export const Route = createFileRoute("/_authenticated/friends")({
  ssr: false,
  component: FriendsPage,
});

function FriendsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: friends = [] } = useQuery({ queryKey: ["friends"], queryFn: getFriends });
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async (uname: string) => {
    setAdding(true);
    try {
      const friend = await addFriendByUsername(uname);
      toast.success(`Added @${friend.username}`);
      qc.invalidateQueries({ queryKey: ["friends"] });
      setAddOpen(false); setUsername("");
      navigate({ to: "/chats/$friendId", params: { friendId: friend.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setAdding(false); }
  };

  const handleScanned = (text: string) => {
    setScanOpen(false);
    const uname = text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length) : text;
    handleAdd(uname);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 py-4 border-b bg-card/50 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Friends</h1>
        <div className="flex gap-2">
          <button onClick={() => setScanOpen(true)}
            className="p-2 rounded-full hover:bg-accent" aria-label="Scan QR"><ScanLine className="w-5 h-5" /></button>
          <button onClick={() => setAddOpen(true)}
            className="p-2 rounded-full hover:bg-accent" aria-label="Add friend"><UserPlus className="w-5 h-5" /></button>
        </div>
      </header>

      {friends.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-muted-foreground">No friends yet. Scan a QR or add by username.</p>
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

      {addOpen && (
        <Modal onClose={() => setAddOpen(false)} title="Add a friend">
          <form onSubmit={(e) => { e.preventDefault(); if (username.trim()) handleAdd(username); }} className="space-y-3">
            <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username" className="w-full px-3 py-2.5 rounded-lg bg-input text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={adding || !username.trim()}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {adding ? "Adding…" : "Add friend"}
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
