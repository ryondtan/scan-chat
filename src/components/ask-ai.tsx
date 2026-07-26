import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles,
  Send,
  Loader2,
  X,
  Trash2,
  MessageSquare,
  FileText,
  BookOpen,
  Brain,
  ClipboardList,
  Wand2,
  Languages,
  FileSearch,
} from "lucide-react";
import {
  askAssistant,
  listAssistantMessages,
  clearAssistantMessages,
  listUserFilesLite,
  type AiMode,
} from "@/lib/ai.functions";

type Msg = { id?: string; role: "user" | "assistant"; content: string };

const MODES: { id: AiMode; label: string; icon: React.ComponentType<{ className?: string }>; placeholder: string; hint: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, placeholder: "Ask anything…", hint: "Ongoing conversation with Lumen." },
  { id: "summarize", label: "Summarize", icon: FileText, placeholder: "Paste text to summarize…", hint: "Turns long text into a clean outline." },
  { id: "explain", label: "Explain homework", icon: BookOpen, placeholder: "Paste a problem or question…", hint: "Step-by-step explanation." },
  { id: "quiz", label: "Generate quiz", icon: ClipboardList, placeholder: "Topic or notes…", hint: "Creates 5 practice questions." },
  { id: "flashcards", label: "Flashcards", icon: Brain, placeholder: "Topic or notes…", hint: "Q/A cards for spaced repetition." },
  { id: "rewrite", label: "Rewrite", icon: Wand2, placeholder: "Text to polish…", hint: "Clearer and grammatically clean." },
  { id: "translate", label: "Translate", icon: Languages, placeholder: "Text to translate…", hint: "Pick a target language below." },
  { id: "doc-qa", label: "Ask a document", icon: FileSearch, placeholder: "Question about the file (optional)…", hint: "Pick an uploaded file to query." },
];

export function AskAIButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 h-12 px-4 rounded-full bg-primary text-primary-foreground shadow-lg hover:brightness-110 flex items-center gap-2 text-sm font-medium"
        aria-label="Ask AI"
      >
        <Sparkles className="w-4 h-4" />
        Ask AI
      </button>
      {open && <AskAIPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function AskAIPanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<AiMode>("chat");
  const [input, setInput] = useState("");
  const [targetLang, setTargetLang] = useState("English");
  const [fileId, setFileId] = useState<string>("");
  const [files, setFiles] = useState<{ id: string; name: string; mime_type: string | null }[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = useServerFn(askAssistant);
  const listMsgs = useServerFn(listAssistantMessages);
  const clearMsgs = useServerFn(clearAssistantMessages);
  const listFiles = useServerFn(listUserFilesLite);

  const ctx = "ask-ai";
  const current = useMemo(() => MODES.find((m) => m.id === mode)!, [mode]);

  useEffect(() => {
    setLoading(true);
    listMsgs({ data: { context: ctx } })
      .then((rows) => setMessages(rows as Msg[]))
      .catch(() => {})
      .finally(() => setLoading(false));
    listFiles().then((rows) => setFiles(rows as typeof files)).catch(() => {});
  }, [listMsgs, listFiles]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (mode === "doc-qa" && !fileId) return toast.error("Pick a file first");
    if (!text && mode !== "doc-qa") return;
    setBusy(true);
    const userMsg: Msg = { role: "user", content: text || `[${current.label}]` };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    try {
      const { reply } = await ask({
        data: {
          mode,
          input: text,
          context: ctx,
          targetLanguage: mode === "translate" ? targetLang : undefined,
          fileId: mode === "doc-qa" ? fileId : undefined,
          persist: mode === "chat",
        },
      });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast.error(msg);
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (!confirm("Clear this conversation?")) return;
    try {
      await clearMsgs({ data: { context: ctx } });
      setMessages([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-2xl h-[90vh] sm:h-[85vh] sm:rounded-2xl border shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 grid place-items-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold">Ask AI</div>
              <div className="text-xs text-muted-foreground">{current.hint}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={clearAll} disabled={!messages.length} className="p-2 rounded-md hover:bg-accent disabled:opacity-40" title="Clear">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-md hover:bg-accent" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b bg-card/50">
          {MODES.map((m) => {
            const active = m.id === mode;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border transition-colors ${
                  active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent border-border"
                }`}
              >
                <m.icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Start by choosing a mode and describing what you need.
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={m.id ?? i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-3.5 py-2 text-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                ) : (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</div>
                )}
              </div>
            ))
          )}
          {busy && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
            </div>
          )}
        </div>

        <form onSubmit={submit} className="border-t p-3 space-y-2">
          {mode === "translate" && (
            <input
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              placeholder="Target language (e.g. Spanish, French, Japanese)"
              className="w-full text-xs rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
          {mode === "doc-qa" && (
            <select
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
              className="w-full text-xs rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">
                {files.length === 0 ? "No files uploaded — go to Files first" : "Select an uploaded file…"}
              </option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={current.placeholder}
              rows={1}
              disabled={busy}
              className="flex-1 resize-none bg-transparent px-2 py-2 text-sm focus:outline-none disabled:opacity-60 max-h-40"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(e as unknown as React.FormEvent);
                }
              }}
            />
            <button
              type="submit"
              disabled={busy || (mode !== "doc-qa" && !input.trim())}
              className="h-9 w-9 grid place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:brightness-110"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
