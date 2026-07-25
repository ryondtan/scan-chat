import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell } from "@/lib/page-shell";
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar, BookOpen, Sparkles, MapPin, Clock } from "lucide-react";
import { listEvents, createEvent, deleteEvent } from "@/lib/school.functions";

export const Route = createFileRoute("/_authenticated/planner")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Planner — Lumen" },
      { name: "description", content: "Your school planner: classes, quizzes, assignments and reminders in one calendar." },
    ],
  }),
  component: PlannerPage,
});

type Ev = {
  id: string; title: string; description: string | null; event_type: string;
  location: string | null; starts_at: string; ends_at: string | null; reminder_minutes: number | null;
};

const TYPES = [
  { key: "class", label: "Class", color: "bg-blue-500", icon: BookOpen },
  { key: "quiz", label: "Quiz", color: "bg-purple-500", icon: Sparkles },
  { key: "assignment", label: "Assignment", color: "bg-orange-500", icon: BookOpen },
  { key: "personal", label: "Personal", color: "bg-emerald-500", icon: Calendar },
] as const;

function typeMeta(t: string) { return TYPES.find((x) => x.key === t) ?? TYPES[3]; }

function PlannerPage() {
  const listFn = useServerFn(listEvents);
  const createFn = useServerFn(createEvent);
  const delFn = useServerFn(deleteEvent);
  const [events, setEvents] = useState<Ev[]>([]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = () => listFn().then((rows) => setEvents(rows as Ev[])).catch((e) => toast.error(String(e))).finally(() => setLoading(false));
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const monthDays = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const eventsByDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of events) {
      const k = dayKey(new Date(e.starts_at));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return m;
  }, [events]);

  const dayEvents = eventsByDay.get(dayKey(selectedDay)) ?? [];

  return (
    <PageShell
      title="Planner"
      description="Calendar, classes, quizzes, assignments and reminders."
      actions={
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" /> New event
        </button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border bg-card p-4">
          <header className="flex items-center justify-between mb-3">
            <div className="font-semibold">
              {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded-md hover:bg-accent" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="w-4 h-4" /></button>
              <button className="text-xs px-2 py-1 rounded-md hover:bg-accent" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelectedDay(d); }}>Today</button>
              <button className="p-1.5 rounded-md hover:bg-accent" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="w-4 h-4" /></button>
            </div>
          </header>
          <div className="grid grid-cols-7 text-[11px] uppercase text-muted-foreground mb-1">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="text-center py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((d, i) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const isSel = dayKey(d) === dayKey(selectedDay);
              const isToday = dayKey(d) === dayKey(new Date());
              const dayEv = eventsByDay.get(dayKey(d)) ?? [];
              return (
                <button key={i} onClick={() => setSelectedDay(d)}
                  className={`aspect-square rounded-lg text-left p-1.5 border transition text-xs ${
                    isSel ? "border-primary bg-primary/5" : "border-transparent hover:border-border"
                  } ${inMonth ? "" : "opacity-40"}`}>
                  <div className={`w-6 h-6 grid place-items-center rounded-full text-[11px] ${isToday ? "bg-primary text-primary-foreground" : ""}`}>{d.getDate()}</div>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {dayEv.slice(0, 3).map((e) => <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${typeMeta(e.event_type).color}`} />)}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="rounded-xl border bg-card p-4">
          <div className="text-sm font-semibold">
            {selectedDay.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </div>
          <div className="mt-3 space-y-2">
            {loading ? <div className="text-sm text-muted-foreground">Loading…</div> :
              dayEvents.length === 0 ? <div className="text-sm text-muted-foreground">Nothing scheduled.</div> :
              dayEvents.map((e) => {
                const t = typeMeta(e.event_type);
                return (
                  <div key={e.id} className="group rounded-lg border p-3 flex gap-3">
                    <div className={`w-1 rounded-full ${t.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{e.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{fmtTime(e.starts_at)}{e.ends_at ? `–${fmtTime(e.ends_at)}` : ""}</span>
                        {e.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location}</span>}
                        <span className="capitalize">{t.label}</span>
                      </div>
                      {e.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{e.description}</p>}
                    </div>
                    <button onClick={async () => { await delFn({ data: { id: e.id } }); reload(); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
          </div>
        </aside>
      </div>

      {showAdd && (
        <AddEventModal
          defaultDate={selectedDay}
          onClose={() => setShowAdd(false)}
          onSave={async (payload) => {
            try {
              await createFn({ data: payload });
              setShowAdd(false);
              reload();
              toast.success("Event added");
            } catch (e) { toast.error(String(e)); }
          }}
        />
      )}
    </PageShell>
  );
}

function AddEventModal({ defaultDate, onClose, onSave }: {
  defaultDate: Date;
  onClose: () => void;
  onSave: (p: { title: string; description: string; event_type: string; location: string; starts_at: string; ends_at: string | null; reminder_minutes: number | null; }) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("class");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(toDateInput(defaultDate));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [desc, setDesc] = useState("");
  const [reminder, setReminder] = useState<string>("15");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const starts_at = new Date(`${date}T${start}:00`).toISOString();
    const ends_at = end ? new Date(`${date}T${end}:00`).toISOString() : null;
    onSave({
      title, description: desc, event_type: type, location,
      starts_at, ends_at,
      reminder_minutes: reminder ? parseInt(reminder, 10) : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">New event</h3>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">Cancel</button>
        </div>
        <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <div className="flex gap-2 flex-wrap">
          {TYPES.map((t) => (
            <button key={t.key} type="button" onClick={() => setType(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs border ${type === t.key ? "bg-primary text-primary-foreground border-primary" : ""}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-lg bg-input border-0 text-sm" />
          <input placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} className="px-3 py-2 rounded-lg bg-input border-0 text-sm" />
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="px-3 py-2 rounded-lg bg-input border-0 text-sm" />
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="px-3 py-2 rounded-lg bg-input border-0 text-sm" />
        </div>
        <textarea rows={2} placeholder="Notes (optional)" value={desc} onChange={(e) => setDesc(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-input border-0 text-sm" />
        <div className="flex items-center gap-2 text-sm">
          <label className="text-muted-foreground">Remind</label>
          <select value={reminder} onChange={(e) => setReminder(e.target.value)} className="px-2 py-1.5 rounded-md bg-input border-0 text-sm">
            <option value="">No reminder</option>
            <option value="5">5 min before</option>
            <option value="15">15 min before</option>
            <option value="30">30 min before</option>
            <option value="60">1 hour before</option>
            <option value="1440">1 day before</option>
          </select>
        </div>
        <button type="submit" className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Add event</button>
      </form>
    </div>
  );
}

function dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function toDateInput(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function buildMonthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i); return d;
  });
}
