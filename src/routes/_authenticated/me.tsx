import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { getMyProfile, QR_PREFIX } from "@/lib/chat-api";
import { Avatar } from "@/components/chat/avatar";
import { useSignOut } from "./route";
import { LogOut, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/me")({
  ssr: false,
  component: MePage,
});

function MePage() {
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: getMyProfile });
  const signOut = useSignOut();

  if (!profile) return <div className="p-6 text-center text-muted-foreground">Loading…</div>;

  const qrValue = QR_PREFIX + profile.username;

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 py-4 border-b bg-card/50">
        <h1 className="text-2xl font-bold">Me</h1>
      </header>

      <div className="flex flex-col items-center px-6 py-8 gap-6">
        <div className="flex flex-col items-center gap-2">
          <Avatar profile={profile} size={80} />
          <div className="text-xl font-semibold">{profile.display_name}</div>
          <button onClick={() => { navigator.clipboard.writeText(profile.username); toast.success("Username copied"); }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            @{profile.username} <Copy className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-card rounded-2xl p-5 shadow-sm border flex flex-col items-center gap-3">
          <QRCodeSVG value={qrValue} size={200} level="M" includeMargin={false} />
          <p className="text-xs text-muted-foreground text-center max-w-[220px]">
            Friends can scan this to add you instantly.
          </p>
        </div>

        <button onClick={signOut}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm hover:bg-accent">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
