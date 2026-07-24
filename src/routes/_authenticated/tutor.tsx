import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell, ComingSoon } from "@/lib/page-shell";
import { Send, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tutor")({
  head: () => ({
    meta: [
      { title: "AI Tutor — Lumen" },
      { name: "description", content: "Chat with an AI tutor for patient, step-by-step help across any subject." },
    ],
  }),
  component: TutorPage,
});

type Message = { role: "user" | "assistant"; content: string };

function TutorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "The AI tutor isn't connected yet. Once enabled, you'll get step-by-step explanations here." },
    ]);
    setInput("");
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI Tutor
          </h1>
          <p className="text-xs text-muted-foreground">Ask anything — from algebra to essays.</p>
        </div>
        <ComingSoon note="Model integration pending" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-12 h-12 rounded-xl bg-accent grid place-items-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-accent-foreground" />
              </div>
              <h2 className="text-lg font-semibold">How can I help you learn today?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Try "Explain photosynthesis" or "Help me with quadratic equations".</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 text-sm">
                    {m.content}
                  </div>
                ) : (
                  <div className="text-sm leading-relaxed text-foreground">{m.content}</div>
                )}
              </div>
            ))
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
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(e as unknown as React.FormEvent);
              }
            }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="h-9 w-9 grid place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
