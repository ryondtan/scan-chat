import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";
import { errMsg } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your password — Lumen" },
      { name: "description", content: "Choose a new password for your Lumen student account." },
      { property: "og:title", content: "Reset your password — Lumen" },
      { property: "og:description", content: "Choose a new password for your Lumen student account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords don't match");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-accent/40 to-background">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg mb-4">
            <Sparkles className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Set a new password</h1>
        </div>
        <div className="bg-card rounded-2xl border shadow-sm p-6">
          {!ready ? (
            <p className="text-sm text-muted-foreground">
              Open the reset link from your email on this device to continue.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <input
                required
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                required
                type="password"
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {loading ? "Saving…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
