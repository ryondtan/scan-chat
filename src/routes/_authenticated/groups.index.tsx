import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell, EmptyState } from "@/lib/page-shell";
import { Users, Plus, KeyRound, BookOpen } from "lucide-react";
import { listMyGroups, createGroup, joinGroupByCode } from "@/lib/groups.functions";
import type { GroupSummary } from "@/lib/groups-types";
import { GroupAvatar } from "@/components/chat/avatar";

export const Route = createFileRoute("/_authenticated/groups/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Study Groups — Lumen" },
      {
        name: "description",
        content: "Create or join a study group to share notes, files, tasks, flashcards, quizzes and a shared AI tutor.",
      },
      { property: "og:title", content: "Study Groups — Lumen" },
      { property: "og:description", content: "Study together: shared notes, files, planner, tasks, flashcards, quizzes and AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupsPage,
});

function GroupsPage() {
  const navigate = useNavigate();
  const listFn = useServerFn(listMyGroups);
  const createFn = useServerFn(createGroup);
  const joinFn = useServerFn(joinGroupByCode);

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<null | "create" | "join">(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");

  const reload = () =>
    listFn()
      .then((r) => setGroups(r as GroupSummary[]))
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitCreate = async () => {
    if (!name.trim()) return toast.error("Give your group a name");
    setBusy(true);
    try {
      const g = (await createFn({ data: { name, subject, description } })) as { id: string };
      toast.success("Group created");
      navigate({ to: "/groups/$groupId", params: { groupId: g.id } });
    } catch (e) {
      toast.errorerrMsg(e);
    } finally {
      setBusy(false);
    }
  };

  const submitJoin = async () => {
    if (!code.trim()) return toast.error("Enter a join code");
    setBusy(true);
    try {
      const g = (await joinFn({ data: { code } })) as { id: string; name: string };
      toast.success(`Joined ${g.name}`);
      navigate({ to: "/groups/$groupId", params: { groupId: g.id } });
    } catch (e) {
      toast.errorerrMsg(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      title="Study Groups"
      description="Study together — shared notes, files, planner, tasks, flashcards, quizzes and AI."
      actions={
        <div className="flex gap-2">
          <button
            onClick={() => setMode("join")}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium"
          >
            <KeyRound className="w-4 h-4" /> Join with code
          </button>
          <button
            onClick={() => setMode("create")}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> New group
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No study groups yet"
          description="Create a group for your class or project, then invite friends or share the join code."
          action={
            <button
              onClick={() => setMode("create")}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm"
            >
              Create a group
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <Link
              key={g.id}
              to="/groups/$groupId"
              params={{ groupId: g.id }}
              className="rounded-xl border p-4 bg-card hover:bg-accent/40 transition-colors flex gap-3 items-start"
            >
              <GroupAvatar name={g.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{g.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {g.subject ? `${g.subject} · ` : ""}
                  {g.member_count} member{g.member_count === 1 ? "" : "s"}
                </div>
                {g.description && (
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{g.description}</p>
                )}
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-mono rounded-md border px-2 py-0.5 text-muted-foreground">
                  <BookOpen className="w-3 h-3" /> {g.join_code}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {mode && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm grid place-items-center p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-lg">
            <h2 className="font-semibold mb-4">{mode === "create" ? "New study group" : "Join a group"}</h2>
            {mode === "create" ? (
              <div className="space-y-3">
                <Field label="Name">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Biology Finals Crew"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Subject (optional)">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Biology"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Description (optional)">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </Field>
              </div>
            ) : (
              <Field label="Join code">
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono tracking-widest uppercase"
                />
              </Field>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setMode(null)} className="px-3 py-2 rounded-lg border text-sm">
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={mode === "create" ? submitCreate : submitJoin}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-60"
              >
                {busy ? "Working…" : mode === "create" ? "Create" : "Join"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
