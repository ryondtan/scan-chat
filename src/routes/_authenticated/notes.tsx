import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell } from "@/lib/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { askAssistant } from "@/lib/ai.functions";
import { StickyNote, Plus, Trash2, Pin, PinOff, Search, Sparkles, Loader2, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Notes — Lumen" },
      { name: "description", content: "Capture lectures and readings, then summarize them instantly with AI." },
      { property: "og:title", content: "Notes — Lumen" },
      { property: "og:description", content: "Write, organize and AI-summarize your study notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotesPage,
});

type Note = {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  updated_at: string;
};

function NotesPage() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [aiBusy, setAiBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ask = useServerFn(askAssistant);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("user_notes")
      .select("id, title, content, is_pinned, updated_at")
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) return toast.error(error.message);
    const rows = (data ?? []) as Note[];
    setNotes(rows);
    setActiveId((prev) => prev ?? rows[0]?.id ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = notes?.find((n) => n.id === activeId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes ?? [];
    return (notes ?? []).filter((n) => `${n.title} ${n.content}`.toLowerCase().includes(q));
  }, [notes, query]);

  const create = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data, error } = await supabase
      .from("user_notes")
      .insert({ user_id: auth.user.id, title: "Untitled note", content: "" })
      .select("id, title, content, is_pinned, updated_at")
      .single();
    if (error) return toast.error(error.message);
    setNotes((prev) => [data as Note, ...(prev ?? [])]);
    setActiveId((data as Note).id);
  };

  const patchLocal = (id: string, patch: Partial<Note>) =>
    setNotes((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)));

  const persist = (id: string, patch: Partial<Note>) => {
    setSaving("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await supabase.from("user_notes").update(patch).eq("id", id);
      if (error) {
        setSaving("idle");
        return toast.error(error.message);
      }
      setSaving("saved");
      setTimeout(() => setSaving("idle"), 1500);
    }, 600);
  };

  const edit = (patch: Partial<Note>) => {
    if (!active) return;
    patchLocal(active.id, patch);
    persist(active.id, patch);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    const { error } = await supabase.from("user_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setNotes((prev) => (prev ?? []).filter((n) => n.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const summarize = async () => {
    if (!active?.content.trim()) return toast.error("Write something first.");
    setAiBusy(true);
    try {
      const res = (await ask({
        data: { mode: "summarize", input: active.content, persist: false },
      })) as { reply?: string } | string;
      const text = typeof res === "string" ? res : res.reply ?? "";
      const merged = `${active.content}\n\n---\n\n### AI summary\n${text}`;
      patchLocal(active.id, { content: merged });
      persist(active.id, { content: merged });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <PageShell
      title="Notes"
      description="Capture ideas, lectures and readings — then let AI summarize what matters."
      actions={
        <button onClick={create} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
          <Plus className="w-4 h-4" /> New note
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[280px_1fr] min-h-[540px]">
        <aside className="rounded-xl border bg-card p-2 flex flex-col">
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              className="w-full pl-8 pr-2 py-2 text-sm rounded-md bg-input focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {notes === null ? (
            <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No notes yet. Create your first one.</p>
          ) : (
            <ul className="space-y-0.5 overflow-y-auto">
              {filtered.map((n) => (
                <li key={n.id} className="group flex items-center">
                  <button
                    onClick={() => setActiveId(n.id)}
                    className={`flex-1 text-left px-2.5 py-2 rounded-md min-w-0 ${
                      activeId === n.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {n.is_pinned && <Pin className="w-3 h-3 shrink-0 text-primary" />}
                      {n.title || "Untitled note"}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {n.content.trim().slice(0, 60) || "Empty"}
                    </div>
                  </button>
                  <button
                    onClick={() => remove(n.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-destructive hover:bg-destructive/10"
                    aria-label="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded-xl border bg-card flex flex-col overflow-hidden">
          {!active ? (
            <div className="flex-1 grid place-items-center text-center px-6 py-16">
              <div>
                <StickyNote className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium">Select or create a note</p>
                <p className="text-sm text-muted-foreground">Everything saves automatically as you type.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <input
                  value={active.title}
                  onChange={(e) => edit({ title: e.target.value })}
                  placeholder="Note title"
                  className="flex-1 bg-transparent font-semibold text-sm focus:outline-none"
                />
                <span className="text-[11px] text-muted-foreground w-14 text-right">
                  {saving === "saving" ? "Saving…" : saving === "saved" ? (
                    <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
                  ) : ""}
                </span>
                <button
                  onClick={() => edit({ is_pinned: !active.is_pinned })}
                  className="p-1.5 rounded hover:bg-accent"
                  aria-label={active.is_pinned ? "Unpin note" : "Pin note"}
                >
                  {active.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </button>
                <button
                  onClick={summarize}
                  disabled={aiBusy}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs disabled:opacity-60"
                >
                  {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Summarize
                </button>
              </div>
              <textarea
                value={active.content}
                onChange={(e) => edit({ content: e.target.value })}
                placeholder="Start writing…"
                className="flex-1 w-full resize-none px-5 py-4 bg-transparent text-sm leading-relaxed focus:outline-none"
              />
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
