import { createFileRoute } from "@tanstack/react-router";
import { PageShell, EmptyState, ComingSoon } from "@/lib/page-shell";
import { Brain } from "lucide-react";

export const Route = createFileRoute("/_authenticated/flashcards")({
  head: () => ({
    meta: [
      { title: "Flashcards — Lumen" },
      { name: "description", content: "Turn any topic or note into spaced-repetition flashcards." },
    ],
  }),
  component: FlashcardsPage,
});

function FlashcardsPage() {
  return (
    <PageShell title="Flashcards" description="Study smarter with spaced repetition." actions={<ComingSoon />}>
      <EmptyState
        icon={Brain}
        title="No decks yet"
        description="Generate flashcards from your notes or a topic once AI is connected."
      />
    </PageShell>
  );
}
