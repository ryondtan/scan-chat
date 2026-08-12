import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Sparkles, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listTutorMessages, sendTutorMessage, clearTutorMessages } from "@/lib/tutor.functions";
import { Markdown } from "@/components/markdown";

export const Route = createFileRoute("/_authenticated/tutor")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AI Tutor — Lumen" },
      { name: "description", content: "Chat with an AI tutor powered by Gemini for step-by-step help across any subject." },
    ],
  }),
  component: TutorPage,
});

type Message = { id?: string; role: "user" | "assistant"; content: string };

function TutorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const listFn = useServerFn(listTutorMessages);
  const sendFn = useServerFn(sendTutorMessage);
  const clearFn = useServerFn(clearTutorMessages);

  useEffect(() => {
    setLoading(true);
    listFn()
      .then((rows) => setMessages(rows as Message[]))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load history"))
      .finally(() => setLoading(false));
  }, [listFn]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    const optimistic: Message = { role: "user", content: text };
    setMessages((m) => [...m, optimistic]);
    try {
      const { reply } = await sendFn({ data: { content: text } });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send";
      toast.error(msg);
      setMessages((m) => m.filter((x) => x !== optimistic));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const clearAll = async () => {
    if (!messages.length) return;
    if (!confirm("Clear this conversation?")) return;
    try {
      await clearFn();
      setMessages([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear");
    }
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI Tutor
          </h1>
          <p className="text-xs text-muted-foreground">Powered by Gemini 2.5 Flash · Ask anything.</p>
        </div>
        <button
          onClick={clearAll}
          disabled={!messages.length}
          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {loading ? (
            <div className="flex justify-center py-20 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-12 h-12 rounded-xl bg-accent grid place-items-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-accent-foreground" />
              </div>
              <h2 className="text-lg font-semibold">How can I help you learn today?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Try "Explain photosynthesis" or "Help me with quadratic equations".</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={m.id ?? i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 text-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                ) : (
                  <Markdown content={m.content} className="text-foreground" />
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
            </div>
          )}
        </div>
      </div>

      <form onSubmit={send} className="border-t p-4">
        <div className="max-w-3xl mx-auto flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message AI Tutor…"
            rows={1}
            disabled={sending}
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm focus:outline-none disabled:opacity-60"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(e as unknown as React.FormEvent);
              }
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="h-9 w-9 grid place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
