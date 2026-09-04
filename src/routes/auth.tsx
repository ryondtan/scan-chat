import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Sparkles, ArrowLeft } from "lucide-react";
import { fetchAllowedDomains } from "@/lib/admin-api";
import { errMsg } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in to Lumen — AI school workspace" },
      { name: "description", content: "Sign in or create your Lumen account with email verification, then study, chat and plan with AI." },
      { property: "og:title", content: "Sign in to Lumen" },
      { property: "og:description", content: "Verified sign-in for the Lumen AI school workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

type Step = "form" | "otp" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [otpFor, setOtpFor] = useState<"signin" | "signup">("signin");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => { document.getElementById("email-input")?.focus(); }, [mode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const signInWithGoogle = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  // Sends a 6-digit code. For sign-up the account is only created once the
  // code is verified, so unreachable/fake addresses can never register.
  const sendCode = async (addr: string, createUser: boolean) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: {
        shouldCreateUser: createUser,
        emailRedirectTo: `${window.location.origin}/dashboard`,
        ...(createUser
          ? { data: { username: username.trim().toLowerCase(), display_name: displayName.trim() || username.trim().toLowerCase(), role } }
          : {}),
      },
    });
    if (error) throw error;
    setCooldown(60);
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      if (otpFor === "signup" && password) {
        const { error: pwErr } = await supabase.auth.updateUser({ password });
        if (pwErr) throw pwErr;
      }
      toast.success(otpFor === "signup" ? "Account verified and created!" : "Verified");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(errMsg(err) || "Invalid or expired code");
    } finally { setLoading(false); }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    try {
      await sendCode(email.trim(), otpFor === "signup");
      toast.success("New code sent");
    } catch (err) { toast.error(errMsg(err)); }
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent — check your inbox.");
      setStep("form");
    } catch (err) {
      toast.error(errMsg(err));
    } finally { setLoading(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const allowed = await fetchAllowedDomains();
        const domain = email.trim().toLowerCase().split("@")[1] ?? "";
        if (allowed.length > 0 && !allowed.includes(domain)) {
          toast.error(`Sign-ups are limited to: ${allowed.map((d) => "@" + d).join(", ")}`);
          return;
        }
        const uname = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
          toast.error("Username: 3–20 chars, a–z, 0–9, _");
          return;
        }
        // Step 1: email the code. No account exists until the code is verified.
        await sendCode(email.trim(), true);
        setOtpFor("signup");
        setCode("");
        setStep("otp");
        toast.success("We emailed you a 6-digit verification code.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Step 2: email verification code before the session is kept.
        await supabase.auth.signOut();
        await sendCode(email.trim(), false);
        setOtpFor("signin");
        setCode("");
        setStep("otp");
        toast.success("We emailed you a 6-digit verification code.");
      }
    } catch (err) {
      const msg = errMsg(err);
      toast.error(msg.includes("duplicate") ? "Username already taken" : msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-accent/40 to-background">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg mb-4">
            <Sparkles className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Lumen</h1>
          <p className="text-sm text-muted-foreground mt-1">AI learning for students and teachers</p>
        </div>

        <div className="bg-card rounded-2xl border shadow-sm p-6">
          {step === "otp" && (
            <div className="space-y-4">
              <button type="button" onClick={() => setStep("form")}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div>
                <h2 className="font-semibold text-lg">Enter your 6-digit code</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Sent to <span className="font-medium text-foreground">{email}</span>.
                  {otpFor === "signup" && " Your account is created once the code is verified."}
                </p>
              </div>
              <form onSubmit={verifyCode} className="space-y-3">
                <input autoFocus inputMode="numeric" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full px-3 py-3 rounded-lg bg-input border-0 text-center text-2xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-ring" />
                <button type="submit" disabled={loading || code.length !== 6}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                  {loading ? "Verifying…" : "Verify"}
                </button>
              </form>
              <button type="button" onClick={resend} disabled={cooldown > 0}
                className="w-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          )}

          {step === "forgot" && (
            <div className="space-y-4">
              <button type="button" onClick={() => setStep("form")}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </button>
              <div>
                <h2 className="font-semibold text-lg">Reset your password</h2>
                <p className="text-sm text-muted-foreground mt-1">We'll email you a link to set a new password.</p>
              </div>
              <form onSubmit={sendReset} className="space-y-3">
                <input autoFocus required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email" autoComplete="email"
                  className="w-full px-3 py-2.5 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </div>
          )}

          {step === "form" && (
            <>
              <div className="flex gap-1 p-1 bg-muted rounded-lg mb-5">
                {(["signin", "signup"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition ${mode === m ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                    {m === "signin" ? "Sign in" : "Sign up"}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border bg-card hover:bg-accent text-sm font-medium transition disabled:opacity-50 mb-4"
              >
                <GoogleIcon />
                {googleLoading ? "Opening Google…" : "Continue with Google"}
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or with email</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <form onSubmit={submit} className="space-y-3">
                {mode === "signup" && (
                  <>
                    <input required value={username} onChange={(e) => setUsername(e.target.value)}
                      placeholder="username (3-20, a-z, 0-9, _)"
                      className="w-full px-3 py-2.5 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display name (optional)"
                      className="w-full px-3 py-2.5 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    <div className="flex gap-2">
                      {(["student", "teacher"] as const).map((r) => (
                        <button key={r} type="button" onClick={() => setRole(r)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${role === r ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground"}`}>
                          {r === "student" ? "Student" : "Teacher"}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <input id="email-input" required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email" autoComplete="email"
                  className="w-full px-3 py-2.5 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password" minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="w-full px-3 py-2.5 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                {mode === "signin" && (
                  <button type="button" onClick={() => setStep("forgot")}
                    className="text-xs text-muted-foreground hover:text-foreground">
                    Forgot your password?
                  </button>
                )}
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition">
                  {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Send verification code"}
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  Every sign-in and sign-up is confirmed with a 6-digit code emailed to your address.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8L6 32.7C9.3 39.4 16.1 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C39.7 35.9 44 30.6 44 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
