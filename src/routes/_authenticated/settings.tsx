import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/lib/page-shell";
import { useSignOut } from "@/routes/_authenticated/route";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTheme, type Theme } from "@/lib/theme";
import { useNotificationPermission } from "@/lib/notifications";
import { Sun, Moon, Monitor, Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Settings — Lumen" },
      { name: "description", content: "Manage your account, password, appearance and notifications." },
    ],
  }),
  component: SettingsPage,
});

const THEMES: { key: Theme; label: string; icon: typeof Sun }[] = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
];

function SettingsPage() {
  const signOut = useSignOut();
  const [email, setEmail] = useState<string>("");
  const { theme, setTheme } = useTheme();
  const { perm, request } = useNotificationPermission();

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw !== pw2) return toast.error("Passwords do not match");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) return toast.error(error.message);
    setPw(""); setPw2("");
    toast.success("Password updated");
  };

  return (
    <PageShell title="Settings" description="Manage your account, appearance and notifications.">
      <div className="space-y-6 max-w-2xl">
        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-medium">Account</h2>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as</p>
          <div className="mt-2 text-sm">{email || "—"}</div>
        </section>

        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-medium">Change password</h2>
          <form onSubmit={changePassword} className="mt-3 space-y-3">
            <input
              type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              placeholder="New password" autoComplete="new-password"
              className="w-full px-3 py-2 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
              placeholder="Confirm new password" autoComplete="new-password"
              className="w-full px-3 py-2 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {saving ? "Saving…" : "Update password"}
            </button>
          </form>
        </section>

        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-medium">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose how Lumen looks.</p>
          <div className="mt-3 flex gap-2 flex-wrap">
            {THEMES.map((t) => (
              <button key={t.key} onClick={() => setTheme(t.key)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                  theme === t.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                }`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-medium">Notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Planner reminders are delivered as browser notifications.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm capitalize inline-flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" />
              {perm === "unsupported" ? "Not supported on this device" : perm}
            </span>
            {perm === "default" && (
              <button onClick={request} className="px-3 py-1.5 rounded-lg border text-sm hover:bg-accent">
                Allow notifications
              </button>
            )}
            {perm === "denied" && (
              <span className="text-xs text-muted-foreground">Enable them in your browser site settings.</span>
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-medium text-destructive">Log out</h2>
          <p className="mt-1 text-sm text-muted-foreground">End your session on this device.</p>
          <button onClick={signOut}
            className="mt-3 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent">
            Log out
          </button>
        </section>
      </div>
    </PageShell>
  );
}
