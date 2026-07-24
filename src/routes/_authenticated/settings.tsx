import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/lib/page-shell";
import { useSignOut } from "@/routes/_authenticated/route";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Lumen" },
      { name: "description", content: "Manage your account and preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const signOut = useSignOut();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  return (
    <PageShell title="Settings" description="Manage your account and preferences.">
      <div className="space-y-6 max-w-2xl">
        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-medium">Account</h2>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as</p>
          <div className="mt-2 text-sm">{email || "—"}</div>
        </section>

        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-medium">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Theme preferences will be available soon.</p>
        </section>

        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-medium text-destructive">Sign out</h2>
          <p className="mt-1 text-sm text-muted-foreground">End your session on this device.</p>
          <button
            onClick={signOut}
            className="mt-3 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent"
          >
            Sign out
          </button>
        </section>
      </div>
    </PageShell>
  );
}
