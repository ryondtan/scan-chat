import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell } from "@/lib/page-shell";
import { getDashboardData, quickAsk } from "@/lib/school.functions";
import { Calendar, BookOpen, Sparkles, Flame, Send, Loader2, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — Lumen" },
      { name: "description", content: "Your day at a glance: schedule, homework due and quick AI answers." },
    ],
  }),
  component: Dashboard,
});

type Data = Awaited<ReturnType<typeof getDashboardData>>;

function Dashboard() {
  const dashFn = useServerFn(getDashboardData);
  const askFn = useServerFn(quickAsk);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    dashFn().then((d) => setData(d as Data)).catch((e) => toast.error(String(e))).finally(() => setLoading(false));
  }, [dashFn]);

  const submitAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ask.trim()) return;
    setAsking(true); setAnswer("");
    try {
      const r = await askFn({ data: { question: ask } });
      setAnswer(r.answer);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setAsking(false); }
  };

  const name = data?.profile?.display_name ?? "there";
  const streak = data?.profile?.study_streak ?? 0;

  return (
    <PageShell
      title={`Welcome back, ${name.split(" ")[0]}`}
      description={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      actions={
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-card text-sm">
          <Flame className="w-4 h-4 text-orange-500" />
          <span className="font-semibold">{streak}</span>
          <span className="text-muted-foreground">day streak</span>
        </div>
      }
    >
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0,1,2,3,4,5].map((i) => <div key={i} className="h-40 rounded-xl border bg-card animate-pulse" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card icon={Calendar} title="Today's schedule" to="/planner" empty="No events today.">
            {data?.todayEvents.map((e: any) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground w-14 tabular-nums">{new Date(e.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                <span className="truncate">{e.title}</span>
              </li>
            ))}
          </Card>

          <Card icon={BookOpen} title="Due today" to="/planner" empty="You're all caught up!">
            {data?.dueToday.map((h: any) => (
              <li key={h.id} className="py-1.5 text-sm truncate">• {h.title}{h.subject ? ` · ${h.subject}` : ""}</li>
            ))}
          </Card>


          <div className="rounded-xl border bg-card p-5 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 grid place-items-center"><Sparkles className="w-4 h-4 text-primary" /></div>
              <h3 className="font-medium">Quick ask</h3>
            </div>
            <form onSubmit={submitAsk} className="flex gap-2">
              <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask anything…"
                className="flex-1 px-3 py-2 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <button type="submit" disabled={asking || !ask.trim()} className="h-9 w-9 grid place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
                {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
            {answer && <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{answer}</p>}
            {!answer && !asking && <p className="mt-3 text-xs text-muted-foreground">Powered by Gemini · fast answers, no chat needed.</p>}
          </div>

        </div>
      )}
    </PageShell>
  );
}

function Card({ icon: Icon, title, to, children, empty, colSpan = "" }: {
  icon: React.ComponentType<{ className?: string }>; title: string; to: string;
  children: React.ReactNode; empty: string; colSpan?: string;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <Link to={to} className={`rounded-xl border bg-card p-5 hover:border-primary/40 transition block ${colSpan}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-accent grid place-items-center"><Icon className="w-4 h-4 text-accent-foreground" /></div>
        <h3 className="font-medium">{title}</h3>
      </div>
      {hasChildren ? <ul className="divide-y">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </Link>
  );
}
