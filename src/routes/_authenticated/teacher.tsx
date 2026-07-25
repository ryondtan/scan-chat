import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell, EmptyState } from "@/lib/page-shell";
import { GraduationCap, Megaphone, Plus } from "lucide-react";
import { listAnnouncements, createAnnouncement } from "@/lib/school.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/teacher")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Teacher Workspace — Lumen" },
      { name: "description", content: "Post announcements and manage class activity." },
    ],
  }),
  component: TeacherPage,
});

type Ann = { id: string; title: string; body: string; created_at: string; author?: { display_name?: string | null; username?: string | null } };

function TeacherPage() {
  const listFn = useServerFn(listAnnouncements);
  const createFn = useServerFn(createAnnouncement);
  const [items, setItems] = useState<Ann[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const reload = () => listFn().then((r) => setItems(r as Ann[])).catch((e) => toast.error(String(e))).finally(() => setLoading(false));

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
      setRole(p?.role ?? null);
    });
    reload();
    /* eslint-disable-next-line */
  }, []);

  const isTeacher = role === "teacher";

  return (
    <PageShell
      title="Teacher Workspace"
      description={isTeacher ? "Post announcements visible to everyone." : "See announcements from your teachers."}
      actions={isTeacher ? (
        <button onClick={() => setShowForm((s) => !s)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
          <Plus className="w-4 h-4" /> New announcement
        </button>
      ) : null}
    >
      {isTeacher && showForm && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          try { await createFn({ data: { title, body } }); setTitle(""); setBody(""); setShowForm(false); reload(); toast.success("Posted"); }
          catch (err) { toast.error(String(err)); }
        }} className="rounded-xl border bg-card p-4 mb-4 space-y-2">
          <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-input border-0 text-sm" />
          <textarea required rows={3} placeholder="Announcement body" value={body} onChange={(e) => setBody(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-input border-0 text-sm" />
          <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Post</button>
        </form>
      )}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={isTeacher ? GraduationCap : Megaphone} title={isTeacher ? "No announcements yet" : "Nothing here yet"} description={isTeacher ? "Post an announcement to keep students informed." : "Your teachers haven't posted anything yet."} />
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <article key={a.id} className="rounded-xl border bg-card p-4">
              <h3 className="font-medium">{a.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{a.body}</p>
              <div className="mt-2 text-xs text-muted-foreground">{a.author?.display_name ?? "Teacher"} · {new Date(a.created_at).toLocaleString()}</div>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
