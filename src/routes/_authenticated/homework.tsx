import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell, EmptyState } from "@/lib/page-shell";
import { BookOpen, Plus, Trash2, Check } from "lucide-react";
import { listHomework, createHomework, toggleHomework, deleteHomework } from "@/lib/school.functions";

export const Route = createFileRoute("/_authenticated/homework")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Homework — Lumen" },
      { name: "description", content: "Track assignments and due dates. Get AI help when you're stuck." },
    ],
  }),
  component: HomeworkPage,
});

type HW = { id: string; title: string; subject: string | null; description: string | null; due_date: string | null; priority: string; completed: boolean };

function HomeworkPage() {
  const listFn = useServerFn(listHomework);
  const createFn = useServerFn(createHomework);
  const toggleFn = useServerFn(toggleHomework);
  const delFn = useServerFn(deleteHomework);

  const [items, setItems] = useState<HW[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const reload = () => listFn().then((r) => setItems(r as HW[])).catch((e) => toast.error(String(e))).finally(() => setLoading(false));
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const pending = items.filter((i) => !i.completed);
  const done = items.filter((i) => i.completed);

  return (
    <PageShell
      title="Homework"
      description="Assignments, due dates and progress."
      actions={
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
          <Plus className="w-4 h-4" /> Add
        </button>
      }
    >
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={BookOpen} title="No homework yet" description="Add an assignment to keep track of what's due." action={<button onClick={() => setShowForm(true)} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Add homework</button>} />
      ) : (
        <div className="space-y-6">
          <Section title={`To do (${pending.length})`} items={pending} onToggle={async (i) => { await toggleFn({ data: { id: i.id, completed: true } }); reload(); }} onDelete={async (i) => { await delFn({ data: { id: i.id } }); reload(); }} />
          {done.length > 0 && <Section muted title={`Completed (${done.length})`} items={done} onToggle={async (i) => { await toggleFn({ data: { id: i.id, completed: false } }); reload(); }} onDelete={async (i) => { await delFn({ data: { id: i.id } }); reload(); }} />}
        </div>
      )}

      {showForm && (
        <AddForm onClose={() => setShowForm(false)} onSave={async (p) => {
          try { await createFn({ data: p }); setShowForm(false); reload(); toast.success("Added"); }
          catch (e) { toast.error(String(e)); }
        }} />
      )}
    </PageShell>
  );
}

function Section({ title, items, onToggle, onDelete, muted }: { title: string; items: HW[]; onToggle: (i: HW) => void; onDelete: (i: HW) => void; muted?: boolean }) {
  return (
    <section>
      <h2 className={`text-sm font-medium mb-2 ${muted ? "text-muted-foreground" : ""}`}>{title}</h2>
      <div className="rounded-xl border bg-card divide-y">
        {items.map((i) => (
          <div key={i.id} className="flex items-start gap-3 p-3 group">
            <button onClick={() => onToggle(i)}
              className={`mt-0.5 w-5 h-5 rounded-md border grid place-items-center shrink-0 ${i.completed ? "bg-primary border-primary text-primary-foreground" : ""}`}>
              {i.completed && <Check className="w-3 h-3" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${i.completed ? "line-through text-muted-foreground" : ""}`}>{i.title}</div>
              <div className="text-xs text-muted-foreground flex gap-2 flex-wrap mt-0.5">
                {i.subject && <span>{i.subject}</span>}
                {i.due_date && <span>Due {new Date(i.due_date).toLocaleDateString()}</span>}
                {i.priority === "high" && <span className="text-destructive">High priority</span>}
              </div>
              {i.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{i.description}</p>}
            </div>
            <button onClick={() => onDelete(i)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AddForm({ onClose, onSave }: { onClose: () => void; onSave: (p: { title: string; subject: string; description: string; due_date: string | null; priority: string }) => void }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("normal");
  return (
    <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ title, subject, description: desc, due_date: due ? new Date(due).toISOString() : null, priority }); }}
        onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold">New homework</h3><button type="button" onClick={onClose} className="text-sm text-muted-foreground">Cancel</button></div>
        <input required placeholder="Title (e.g. Algebra Ch. 3)" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-input border-0 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="px-3 py-2 rounded-lg bg-input border-0 text-sm" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="px-3 py-2 rounded-lg bg-input border-0 text-sm" />
        </div>
        <textarea rows={3} placeholder="Notes (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-input border-0 text-sm" />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-input border-0 text-sm">
          <option value="low">Low priority</option>
          <option value="normal">Normal priority</option>
          <option value="high">High priority</option>
        </select>
        <button type="submit" className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Add</button>
      </form>
    </div>
  );
}
