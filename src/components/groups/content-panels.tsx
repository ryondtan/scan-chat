import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/lib/page-shell";
import { formatBytes } from "@/lib/groups-helpers";
import {
  StickyNote,
  Plus,
  Trash2,
  FileUp,
  FolderOpen,
  CheckSquare,
  CalendarDays,
  Download,
  Check,
} from "lucide-react";
import {
  listGroupNotes,
  saveGroupNote,
  deleteGroupNote,
  listGroupFiles,
  registerGroupFile,
  getGroupFileUrl,
  deleteGroupFile,
  listGroupTasks,
  createGroupTask,
  toggleGroupTask,
  deleteGroupTask,
  listGroupEvents,
  createGroupEvent,
  deleteGroupEvent,
} from "@/lib/groups.functions";
import type { GroupEvent, GroupFile, GroupMember, GroupNote, GroupTask } from "@/lib/groups-types";

const btnPrimary =
  "inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60";
const btnGhost = "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm";
const input = "w-full rounded-lg border bg-background px-3 py-2 text-sm";

function err(e: unknown) {
  toast.errorerrMsg(e);
}

/* ============================ NOTES ============================ */

export function NotesPanel({ groupId }: { groupId: string }) {
  const listFn = useServerFn(listGroupNotes);
  const saveFn = useServerFn(saveGroupNote);
  const delFn = useServerFn(deleteGroupNote);

  const [notes, setNotes] = useState<GroupNote[]>([]);
  const [editing, setEditing] = useState<null | Partial<GroupNote>>(null);
  const [loading, setLoading] = useState(true);

  const reload = () =>
    listFn({ data: { groupId } })
      .then((r) => setNotes(r as GroupNote[]))
      .catch(err)
      .finally(() => setLoading(false));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const save = async () => {
    if (!editing?.title?.trim()) return toast.error("Add a title");
    try {
      await saveFn({
        data: { id: editing.id, groupId, title: editing.title, content: editing.content ?? "" },
      });
      setEditing(null);
      reload();
    } catch (e) {
      err(e);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className={btnPrimary} onClick={() => setEditing({ title: "", content: "" })}>
          <Plus className="w-4 h-4" /> New note
        </button>
      </div>

      {notes.length === 0 && !editing ? (
        <EmptyState icon={StickyNote} title="No shared notes" description="Notes you add here are visible to everyone in the group." />
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <button className="text-left min-w-0 flex-1" onClick={() => setEditing(n)}>
                  <div className="font-medium truncate">{n.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{n.content}</p>
                </button>
                <button
                  className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                  onClick={async () => {
                    try {
                      await delFn({ data: { id: n.id } });
                      reload();
                    } catch (e) {
                      err(e);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Updated {new Date(n.updated_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? "Edit note" : "New note"} onClose={() => setEditing(null)} onSave={save}>
          <input
            autoFocus
            className={input}
            placeholder="Title"
            value={editing.title ?? ""}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          />
          <textarea
            className={`${input} mt-3 min-h-56`}
            placeholder="Write the shared note…"
            value={editing.content ?? ""}
            onChange={(e) => setEditing({ ...editing, content: e.target.value })}
          />
        </Modal>
      )}
    </div>
  );
}

/* ============================ FILES ============================ */

export function FilesPanel({ groupId }: { groupId: string }) {
  const listFn = useServerFn(listGroupFiles);
  const regFn = useServerFn(registerGroupFile);
  const urlFn = useServerFn(getGroupFileUrl);
  const delFn = useServerFn(deleteGroupFile);

  const [files, setFiles] = useState<GroupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = () =>
    listFn({ data: { groupId } })
      .then((r) => setFiles(r as GroupFile[]))
      .catch(err)
      .finally(() => setLoading(false));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const path = `${groupId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage.from("group-files").upload(path, file);
        if (error) throw new Error(error.message);
        await regFn({
          data: { groupId, name: file.name, path, size_bytes: file.size, mime_type: file.type },
        });
      }
      toast.success("Uploaded");
      reload();
    } catch (e) {
      err(e);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (loading) return <Loading />;

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        upload(e.dataTransfer.files);
      }}
    >
      <div className="flex justify-end">
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        <button className={btnPrimary} disabled={uploading} onClick={() => inputRef.current?.click()}>
          <FileUp className="w-4 h-4" /> {uploading ? "Uploading…" : "Upload files"}
        </button>
      </div>

      {files.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No shared files" description="Drag files here or upload to share them with the group." />
      ) : (
        <div className="rounded-xl border divide-y bg-card">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{f.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                title="Open"
                onClick={async () => {
                  try {
                    const { url } = await urlFn({ data: { id: f.id } });
                    window.open(url, "_blank", "noopener");
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                onClick={async () => {
                  try {
                    await delFn({ data: { id: f.id } });
                    reload();
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ TASKS ============================ */

export function TasksPanel({ groupId, members }: { groupId: string; members: GroupMember[] }) {
  const listFn = useServerFn(listGroupTasks);
  const createFn = useServerFn(createGroupTask);
  const toggleFn = useServerFn(toggleGroupTask);
  const delFn = useServerFn(deleteGroupTask);

  const [tasks, setTasks] = useState<GroupTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<null | { title: string; description: string; assigned_to: string; due_date: string }>(null);

  const reload = () =>
    listFn({ data: { groupId } })
      .then((r) => setTasks(r as GroupTask[]))
      .catch(err)
      .finally(() => setLoading(false));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const nameOf = (id: string | null) =>
    id ? members.find((m) => m.user_id === id)?.profile?.display_name ?? "Member" : "Unassigned";

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className={btnPrimary}
          onClick={() => setForm({ title: "", description: "", assigned_to: "", due_date: "" })}
        >
          <Plus className="w-4 h-4" /> Assign task
        </button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks yet" description="Split the work — assign tasks to group members with due dates." />
      ) : (
        <div className="rounded-xl border divide-y bg-card">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-3 p-3">
              <button
                className={`mt-0.5 w-5 h-5 rounded-md border grid place-items-center shrink-0 ${t.completed ? "bg-primary border-primary text-primary-foreground" : ""}`}
                onClick={async () => {
                  try {
                    await toggleFn({ data: { id: t.id, completed: !t.completed } });
                    reload();
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                {t.completed && <Check className="w-3.5 h-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${t.completed ? "line-through text-muted-foreground" : ""}`}>
                  {t.title}
                </div>
                {t.description && <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>}
                <div className="mt-1 text-xs text-muted-foreground">
                  {nameOf(t.assigned_to)}
                  {t.due_date ? ` · due ${new Date(t.due_date).toLocaleDateString()}` : ""}
                </div>
              </div>
              <button
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                onClick={async () => {
                  try {
                    await delFn({ data: { id: t.id } });
                    reload();
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal
          title="Assign a task"
          onClose={() => setForm(null)}
          onSave={async () => {
            if (!form.title.trim()) return toast.error("Add a title");
            try {
              await createFn({
                data: {
                  groupId,
                  title: form.title,
                  description: form.description,
                  assigned_to: form.assigned_to || null,
                  due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
                },
              });
              setForm(null);
              reload();
            } catch (e) {
              err(e);
            }
          }}
        >
          <input autoFocus className={input} placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className={`${input} mt-3`} rows={3} placeholder="Details (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <select className={`${input} mt-3`} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile?.display_name ?? m.user_id}
              </option>
            ))}
          </select>
          <input type="datetime-local" className={`${input} mt-3`} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </Modal>
      )}
    </div>
  );
}

/* ============================ PLANNER ============================ */

export function PlannerPanel({ groupId }: { groupId: string }) {
  const listFn = useServerFn(listGroupEvents);
  const createFn = useServerFn(createGroupEvent);
  const delFn = useServerFn(deleteGroupEvent);

  const [events, setEvents] = useState<GroupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<null | { title: string; location: string; description: string; starts_at: string; ends_at: string }>(null);

  const reload = () =>
    listFn({ data: { groupId } })
      .then((r) => setEvents(r as GroupEvent[]))
      .catch(err)
      .finally(() => setLoading(false));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (loading) return <Loading />;

  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= now);
  const past = events.filter((e) => new Date(e.starts_at).getTime() < now).reverse();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className={btnPrimary}
          onClick={() => setForm({ title: "", location: "", description: "", starts_at: "", ends_at: "" })}
        >
          <Plus className="w-4 h-4" /> Add session
        </button>
      </div>

      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Plan study sessions and deadlines everyone in the group can see." />
      ) : (
        <div className="space-y-6">
          <EventList title={`Upcoming (${upcoming.length})`} events={upcoming} onDelete={async (id) => { try { await delFn({ data: { id } }); reload(); } catch (e) { err(e); } }} />
          {past.length > 0 && <EventList title={`Past (${past.length})`} events={past} muted onDelete={async (id) => { try { await delFn({ data: { id } }); reload(); } catch (e) { err(e); } }} />}
        </div>
      )}

      {form && (
        <Modal
          title="New group session"
          onClose={() => setForm(null)}
          onSave={async () => {
            if (!form.title.trim() || !form.starts_at) return toast.error("Title and start time are required");
            try {
              await createFn({
                data: {
                  groupId,
                  title: form.title,
                  location: form.location,
                  description: form.description,
                  starts_at: new Date(form.starts_at).toISOString(),
                  ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
                },
              });
              setForm(null);
              reload();
            } catch (e) {
              err(e);
            }
          }}
        >
          <input autoFocus className={input} placeholder="Session title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={`${input} mt-3`} placeholder="Location or link (optional)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <textarea className={`${input} mt-3`} rows={2} placeholder="Agenda (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted-foreground">
              Starts
              <input type="datetime-local" className={`${input} mt-1`} value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </label>
            <label className="block text-xs text-muted-foreground">
              Ends (optional)
              <input type="datetime-local" className={`${input} mt-1`} value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EventList({
  title,
  events,
  muted,
  onDelete,
}: {
  title: string;
  events: GroupEvent[];
  muted?: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">{title}</h3>
      <div className={`rounded-xl border divide-y bg-card ${muted ? "opacity-60" : ""}`}>
        {events.map((e) => (
          <div key={e.id} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{e.title}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(e.starts_at).toLocaleString()}
                {e.ends_at ? ` – ${new Date(e.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                {e.location ? ` · ${e.location}` : ""}
              </div>
              {e.description && <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>}
            </div>
            <button className="p-2 rounded-lg hover:bg-accent text-muted-foreground" onClick={() => onDelete(e.id)}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ SHARED ============================ */

export function Loading() {
  return <div className="text-sm text-muted-foreground">Loading…</div>;
}

export function Modal({
  title,
  children,
  onClose,
  onSave,
  saveLabel = "Save",
  busy,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-lg max-h-[85vh] overflow-y-auto">
        <h2 className="font-semibold mb-4">{title}</h2>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>
            Close
          </button>
          {onSave && (
            <button onClick={onSave} disabled={busy} className={btnPrimary}>
              {busy ? "Working…" : saveLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
