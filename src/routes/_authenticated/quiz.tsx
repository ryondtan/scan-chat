import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell } from "@/lib/page-shell";
import { errMsg } from "@/lib/utils";
import { generateQuizFromFiles, type QuizQuestion } from "@/lib/quiz.functions";
import { Upload, FileText, X, Loader2, ClipboardPaste, Sparkles, RotateCcw, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quiz")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Quiz Generator — Lumen" },
      { name: "description", content: "Upload your PDFs, slides, images or notes and turn them into a practice quiz instantly." },
      { property: "og:title", content: "Quiz Generator — Lumen" },
      { property: "og:description", content: "Drop your study files and get an instant practice quiz." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuizPage,
});

const MAX_MB = 15;

type Picked = { file: File; id: string };

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = () => reject(new Error("Could not read that file"));
    r.readAsDataURL(file);
  });
}

function QuizPage() {
  const genFn = useServerFn(generateQuizFromFiles);
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<Picked[]>([]);
  const [text, setText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [count, setCount] = useState(10);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [quiz, setQuiz] = useState<{ title: string; questions: QuizQuestion[] } | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const addFiles = (list: FileList | File[]) => {
    const next: Picked[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_MB * 1024 * 1024) {
        toast.error(`${f.name} is larger than ${MAX_MB}MB`);
        continue;
      }
      next.push({ file: f, id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}` });
    }
    setFiles((prev) => [...prev, ...next].slice(0, 5));
  };

  const generate = async () => {
    if (!files.length && !text.trim()) return toast.error("Add a file or paste some text first");
    setBusy(true);
    try {
      const payload = await Promise.all(
        files.map(async (p) => ({
          name: p.file.name,
          mimeType: p.file.type || "application/octet-stream",
          dataBase64: await toBase64(p.file),
        })),
      );
      const r = await genFn({ data: { files: payload, text, count } });
      setQuiz(r as { title: string; questions: QuizQuestion[] });
      setAnswers({});
      setSubmitted(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (quiz) {
    const score = quiz.questions.reduce((n, q, i) => n + (answers[i] === q.answerIndex ? 1 : 0), 0);
    return (
      <PageShell
        title={quiz.title}
        description={`${quiz.questions.length} questions from your material`}
        actions={
          <button
            onClick={() => { setQuiz(null); setSubmitted(false); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
          >
            <RotateCcw className="w-4 h-4" /> New quiz
          </button>
        }
      >
        <div className="space-y-4 max-w-3xl">
          {submitted && (
            <div className="rounded-xl border bg-card p-5">
              <div className="text-2xl font-semibold">{score} / {quiz.questions.length}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {score === quiz.questions.length ? "Perfect — you know this material." : "Review the explanations below."}
              </p>
            </div>
          )}

          {quiz.questions.map((q, i) => (
            <div key={i} className="rounded-xl border bg-card p-5">
              <div className="font-medium mb-3">{i + 1}. {q.question}</div>
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const picked = answers[i] === oi;
                  const correct = submitted && oi === q.answerIndex;
                  const wrong = submitted && picked && oi !== q.answerIndex;
                  return (
                    <button
                      key={oi}
                      onClick={() => !submitted && setAnswers((a) => ({ ...a, [i]: oi }))}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition flex items-center gap-2 ${
                        correct
                          ? "border-primary bg-primary/10"
                          : wrong
                            ? "border-destructive bg-destructive/10"
                            : picked
                              ? "border-primary bg-accent"
                              : "hover:bg-accent"
                      }`}
                    >
                      <span className="w-5 shrink-0 text-muted-foreground">{String.fromCharCode(65 + oi)}</span>
                      <span className="flex-1">{opt}</span>
                      {correct && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
              {submitted && q.explanation && (
                <p className="mt-3 text-sm text-muted-foreground">{q.explanation}</p>
              )}
            </div>
          ))}

          {!submitted && (
            <button
              onClick={() => setSubmitted(true)}
              disabled={Object.keys(answers).length !== quiz.questions.length}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              Submit answers
            </button>
          )}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Quiz Generator" description="Upload your study material and get a quiz made from it.">
      <div className="max-w-3xl space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          className={`rounded-2xl border-2 border-dashed p-10 text-center transition ${
            dragging ? "border-primary bg-accent/40" : "border-border bg-card/40"
          }`}
        >
          <h2 className="text-xl font-semibold">or drop your files</h2>
          <p className="text-sm text-muted-foreground mt-1">pdf, images, docs, slides, text — up to {MAX_MB}MB each</p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm hover:bg-accent">
              <Upload className="w-4 h-4" /> Upload files
            </button>
            <button onClick={() => setShowPaste((v) => !v)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm hover:bg-accent">
              <ClipboardPaste className="w-4 h-4" /> Copied text
            </button>
          </div>

          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.txt,.md,.csv,image/*"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        {showPaste && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste your notes or textbook text here…"
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        )}

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{p.file.name}</span>
                <span className="text-xs text-muted-foreground">{(p.file.size / 1024 / 1024).toFixed(1)}MB</span>
                <button onClick={() => setFiles((f) => f.filter((x) => x.id !== p.id))} className="p-1 rounded hover:bg-accent" aria-label="Remove">
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted-foreground">Questions</label>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            onClick={generate}
            disabled={busy || (!files.length && !text.trim())}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {busy ? "Building your quiz…" : "Generate quiz"}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
