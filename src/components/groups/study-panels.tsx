import { errMsg } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState } from "@/lib/page-shell";
import { Modal, Loading } from "@/components/groups/content-panels";
import { Avatar } from "@/components/chat/avatar";
import { Brain, Sparkles, Plus, Trash2, Send, UserPlus, Copy, BarChart3 } from "lucide-react";
import {
  listGroupDecks,
  createGroupDeck,
  addGroupCard,
  deleteGroupDeck,
  listGroupQuizzes,
  createGroupQuiz,
  recordQuizAttempt,
  deleteGroupQuiz,
  listGroupAiMessages,
  askGroupAi,
  getGroupProgress,
  listInvitableFriends,
  inviteFriendToGroup,
  removeMember,
} from "@/lib/groups.functions";
import type {
  GroupAiMessage,
  GroupDeck,
  GroupMember,
  GroupProfile,
  GroupQuiz,
  MemberProgress,
} from "@/lib/groups-types";

const btnPrimary =
  "inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60";
const btnGhost = "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm";
const input = "w-full rounded-lg border bg-background px-3 py-2 text-sm";

function err(e: unknown) {
  toast.error(errMsg(e));
}

/* ============================ FLASHCARDS ============================ */

export function FlashcardsPanel({ groupId }: { groupId: string }) {
  const listFn = useServerFn(listGroupDecks);
  const createFn = useServerFn(createGroupDeck);
  const addCardFn = useServerFn(addGroupCard);
  const delFn = useServerFn(deleteGroupDeck);

  const [decks, setDecks] = useState<GroupDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<null | { title: string; subject: string; topic: string; useAi: boolean }>(null);
  const [studying, setStudying] = useState<GroupDeck | null>(null);
  const [cardForm, setCardForm] = useState<null | { deckId: string; front: string; back: string }>(null);

  const reload = () =>
    listFn({ data: { groupId } })
      .then((r) => setDecks(r as GroupDeck[]))
      .catch(err)
      .finally(() => setLoading(false));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className={btnPrimary} onClick={() => setForm({ title: "", subject: "", topic: "", useAi: true })}>
          <Plus className="w-4 h-4" /> New deck
        </button>
      </div>

      {decks.length === 0 ? (
        <EmptyState icon={Brain} title="No shared decks" description="Create a deck manually or let AI generate cards from a topic." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {decks.map((d) => (
            <div key={d.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.subject ? `${d.subject} · ` : ""}
                    {d.cards?.length ?? 0} cards
                  </div>
                </div>
                <button
                  className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                  onClick={async () => {
                    try {
                      await delFn({ data: { id: d.id } });
                      reload();
                    } catch (e) {
                      err(e);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <button className={btnGhost} disabled={!d.cards?.length} onClick={() => setStudying(d)}>
                  Study
                </button>
                <button className={btnGhost} onClick={() => setCardForm({ deckId: d.id, front: "", back: "" })}>
                  Add card
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal
          title="New shared deck"
          busy={busy}
          saveLabel={form.useAi ? "Generate" : "Create"}
          onClose={() => setForm(null)}
          onSave={async () => {
            if (!form.title.trim()) return toast.error("Add a deck title");
            setBusy(true);
            try {
              await createFn({ data: { groupId, ...form, count: 8 } });
              setForm(null);
              reload();
            } catch (e) {
              err(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <input autoFocus className={input} placeholder="Deck title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={`${input} mt-3`} placeholder="Subject (optional)" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.useAi} onChange={(e) => setForm({ ...form, useAi: e.target.checked })} />
            Generate cards with AI
          </label>
          {form.useAi && (
            <textarea className={`${input} mt-3`} rows={3} placeholder="What should the cards cover?" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          )}
        </Modal>
      )}

      {cardForm && (
        <Modal
          title="Add card"
          onClose={() => setCardForm(null)}
          onSave={async () => {
            try {
              await addCardFn({ data: cardForm });
              setCardForm(null);
              reload();
            } catch (e) {
              err(e);
            }
          }}
        >
          <input autoFocus className={input} placeholder="Front" value={cardForm.front} onChange={(e) => setCardForm({ ...cardForm, front: e.target.value })} />
          <textarea className={`${input} mt-3`} rows={3} placeholder="Back" value={cardForm.back} onChange={(e) => setCardForm({ ...cardForm, back: e.target.value })} />
        </Modal>
      )}

      {studying && <StudyModal deck={studying} onClose={() => setStudying(null)} />}
    </div>
  );
}

function StudyModal({ deck, onClose }: { deck: GroupDeck; onClose: () => void }) {
  const cards = deck.cards ?? [];
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[i];
  return (
    <Modal title={deck.title} onClose={onClose}>
      <button
        onClick={() => setFlipped((f) => !f)}
        className="w-full min-h-40 rounded-xl border bg-accent/30 p-6 text-center grid place-items-center text-sm"
      >
        <span className="whitespace-pre-wrap">{flipped ? card?.back : card?.front}</span>
      </button>
      <div className="mt-3 flex items-center justify-between text-sm">
        <button
          className={btnGhost}
          onClick={() => {
            setFlipped(false);
            setI((v) => Math.max(0, v - 1));
          }}
        >
          Previous
        </button>
        <span className="text-muted-foreground">
          {i + 1} / {cards.length}
        </span>
        <button
          className={btnGhost}
          onClick={() => {
            setFlipped(false);
            setI((v) => Math.min(cards.length - 1, v + 1));
          }}
        >
          Next
        </button>
      </div>
    </Modal>
  );
}

/* ============================ QUIZZES ============================ */

export function QuizzesPanel({ groupId }: { groupId: string }) {
  const listFn = useServerFn(listGroupQuizzes);
  const createFn = useServerFn(createGroupQuiz);
  const attemptFn = useServerFn(recordQuizAttempt);
  const delFn = useServerFn(deleteGroupQuiz);

  const [quizzes, setQuizzes] = useState<GroupQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<null | { title: string; topic: string; count: number }>(null);
  const [taking, setTaking] = useState<GroupQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<null | { score: number; total: number }>(null);

  const reload = () =>
    listFn({ data: { groupId } })
      .then((r) => setQuizzes(r as unknown as GroupQuiz[]))
      .catch(err)
      .finally(() => setLoading(false));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className={btnPrimary} onClick={() => setForm({ title: "", topic: "", count: 5 })}>
          <Sparkles className="w-4 h-4" /> Generate quiz
        </button>
      </div>

      {quizzes.length === 0 ? (
        <EmptyState icon={Sparkles} title="No shared quizzes" description="Generate a quiz from any topic — everyone's scores show up in progress." />
      ) : (
        <div className="rounded-xl border divide-y bg-card">
          {quizzes.map((q) => (
            <div key={q.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{q.title}</div>
                <div className="text-xs text-muted-foreground">{q.questions?.length ?? 0} questions</div>
              </div>
              <button
                className={btnGhost}
                onClick={() => {
                  setTaking(q);
                  setAnswers({});
                  setResult(null);
                }}
              >
                Take
              </button>
              <button
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                onClick={async () => {
                  try {
                    await delFn({ data: { id: q.id } });
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
          title="Generate a shared quiz"
          busy={busy}
          saveLabel="Generate"
          onClose={() => setForm(null)}
          onSave={async () => {
            if (!form.topic.trim()) return toast.error("Describe the topic");
            setBusy(true);
            try {
              await createFn({ data: { groupId, ...form } });
              setForm(null);
              reload();
            } catch (e) {
              err(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <input autoFocus className={input} placeholder="Quiz title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className={`${input} mt-3`} rows={3} placeholder="Topic or paste study material" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <label className="mt-3 block text-xs text-muted-foreground">
            Questions
            <input type="number" min={3} max={15} className={`${input} mt-1`} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} />
          </label>
        </Modal>
      )}

      {taking && (
        <Modal
          title={taking.title}
          saveLabel={result ? "Done" : "Submit"}
          onClose={() => setTaking(null)}
          onSave={async () => {
            if (result) return setTaking(null);
            const qs = taking.questions ?? [];
            const score = qs.reduce((s, q, idx) => s + (answers[idx] === q.answer ? 1 : 0), 0);
            setResult({ score, total: qs.length });
            try {
              await attemptFn({ data: { quizId: taking.id, groupId, score, total: qs.length } });
            } catch (e) {
              err(e);
            }
          }}
        >
          {result && (
            <div className="mb-4 rounded-lg border bg-accent/40 p-3 text-sm font-medium">
              You scored {result.score} / {result.total}
            </div>
          )}
          <div className="space-y-4">
            {(taking.questions ?? []).map((q, idx) => (
              <div key={idx}>
                <div className="text-sm font-medium">
                  {idx + 1}. {q.question}
                </div>
                <div className="mt-2 space-y-1">
                  {q.options.map((opt, oi) => {
                    const chosen = answers[idx] === oi;
                    const correct = result && q.answer === oi;
                    const wrong = result && chosen && q.answer !== oi;
                    return (
                      <button
                        key={oi}
                        disabled={!!result}
                        onClick={() => setAnswers({ ...answers, [idx]: oi })}
                        className={`w-full text-left text-sm rounded-lg border px-3 py-2 ${correct ? "border-primary bg-primary/10" : wrong ? "border-destructive bg-destructive/10" : chosen ? "bg-accent" : ""}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================ SHARED AI ============================ */

export function GroupAiPanel({ groupId, members }: { groupId: string; members: GroupMember[] }) {
  const listFn = useServerFn(listGroupAiMessages);
  const askFn = useServerFn(askGroupAi);
  const [messages, setMessages] = useState<GroupAiMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = () =>
    listFn({ data: { groupId } })
      .then((r) => setMessages(r as GroupAiMessage[]))
      .catch(err)
      .finally(() => setLoading(false));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const send = async () => {
    if (!text.trim() || busy) return;
    const q = text.trim();
    setText("");
    setBusy(true);
    try {
      await askFn({ data: { groupId, input: q } });
      await reload();
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string | null) =>
    id ? members.find((m) => m.user_id === id)?.profile?.display_name ?? "Member" : "Lumen AI";

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 min-h-64 space-y-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask anything — the whole group sees the conversation and can build on it.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.role === "assistant" ? "" : "text-right"}>
              <div className="text-[11px] text-muted-foreground mb-1">{nameOf(m.user_id)}</div>
              <div
                className={`inline-block max-w-[90%] text-left rounded-xl px-3 py-2 text-sm ${m.role === "assistant" ? "bg-accent" : "bg-primary text-primary-foreground whitespace-pre-wrap"}`}
              >
                {m.role === "assistant" ? <Markdown content={m.content} /> : m.content}
              </div>
            </div>
          ))
        )}
        {busy && <div className="text-sm text-muted-foreground">Lumen is thinking…</div>}
      </div>
      <div className="flex gap-2">
        <input
          className={input}
          placeholder="Ask the group AI…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className={btnPrimary} disabled={busy} onClick={send}>
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ============================ PROGRESS ============================ */

export function ProgressPanel({ groupId }: { groupId: string }) {
  const fn = useServerFn(getGroupProgress);
  const [data, setData] = useState<null | { members: MemberProgress[]; totals: Record<string, number> }>(null);

  useEffect(() => {
    fn({ data: { groupId } })
      .then((r) => setData(r as { members: MemberProgress[]; totals: Record<string, number> }))
      .catch(err);
  }, [fn, groupId]);

  if (!data) return <Loading />;

  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Tasks done" value={`${t.tasks_done}/${t.tasks}`} />
        <Stat label="Notes" value={String(t.notes)} />
        <Stat label="Files" value={String(t.files)} />
        <Stat label="Quiz attempts" value={String(t.quiz_attempts)} />
      </div>
      <div className="rounded-xl border divide-y bg-card">
        {data.members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 p-3">
            <Avatar profile={{ display_name: m.display_name, username: m.display_name, avatar_url: m.avatar_url }} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{m.display_name}</div>
              <div className="text-xs text-muted-foreground">
                {m.tasks_done}/{m.tasks_assigned} tasks · {m.quizzes_taken} quizzes
                {m.avg_score !== null ? ` · ${m.avg_score}% avg` : ""}
              </div>
            </div>
            <div className="w-24 h-2 rounded-full bg-accent overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${m.tasks_assigned ? (m.tasks_done / m.tasks_assigned) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {data.members.length === 0 && (
        <EmptyState icon={BarChart3} title="No progress yet" description="Assign tasks and take quizzes to see group progress." />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

/* ============================ MEMBERS / INVITE ============================ */

export function MembersPanel({
  groupId,
  members,
  joinCode,
  isAdmin,
  onChanged,
}: {
  groupId: string;
  members: GroupMember[];
  joinCode: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const friendsFn = useServerFn(listInvitableFriends);
  const inviteFn = useServerFn(inviteFriendToGroup);
  const removeFn = useServerFn(removeMember);
  const [friends, setFriends] = useState<GroupProfile[] | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Join code</div>
          <div className="font-mono text-lg tracking-widest">{joinCode}</div>
        </div>
        <div className="flex gap-2">
          <button
            className={btnGhost}
            onClick={() => {
              navigator.clipboard?.writeText(joinCode);
              toast.success("Join code copied");
            }}
          >
            <Copy className="w-4 h-4" /> Copy
          </button>
          <button
            className={btnPrimary}
            onClick={async () => {
              setOpen(true);
              try {
                setFriends((await friendsFn({ data: { groupId } })) as GroupProfile[]);
              } catch (e) {
                err(e);
              }
            }}
          >
            <UserPlus className="w-4 h-4" /> Invite friends
          </button>
        </div>
      </div>

      <div className="rounded-xl border divide-y bg-card">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 p-3">
            <Avatar
              profile={{
                display_name: m.profile?.display_name ?? "Member",
                username: m.profile?.username ?? "",
                avatar_url: m.profile?.avatar_url ?? null,
              }}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{m.profile?.display_name ?? "Member"}</div>
              <div className="text-xs text-muted-foreground">@{m.profile?.username} · {m.role}</div>
            </div>
            {isAdmin && m.role !== "owner" && (
              <button
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                onClick={async () => {
                  try {
                    await removeFn({ data: { groupId, userId: m.user_id } });
                    onChanged();
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {open && (
        <Modal title="Invite friends" onClose={() => setOpen(false)}>
          {!friends ? (
            <Loading />
          ) : friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All your friends are already in this group — share the join code instead.
            </p>
          ) : (
            <div className="divide-y">
              {friends.map((f) => (
                <div key={f.id} className="flex items-center gap-3 py-2">
                  <Avatar profile={f} size={32} />
                  <div className="min-w-0 flex-1 text-sm truncate">{f.display_name}</div>
                  <button
                    className={btnGhost}
                    onClick={async () => {
                      try {
                        await inviteFn({ data: { groupId, userId: f.id } });
                        setFriends((prev) => (prev ?? []).filter((p) => p.id !== f.id));
                        toast.success("Added to group");
                        onChanged();
                      } catch (e) {
                        err(e);
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
