import { createFileRoute } from "@tanstack/react-router";
import { PageShell, EmptyState, ComingSoon } from "@/lib/page-shell";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quiz")({
  head: () => ({
    meta: [
      { title: "Quiz Generator — Lumen" },
      { name: "description", content: "Auto-generate quizzes from your notes or any topic." },
    ],
  }),
  component: QuizPage,
});

function QuizPage() {
  return (
    <PageShell title="Quiz Generator" description="Turn topics and notes into practice quizzes." actions={<ComingSoon />}>
      <EmptyState
        icon={Sparkles}
        title="No quizzes yet"
        description="Once AI is connected, you'll generate multiple-choice, short-answer, and true/false quizzes here."
      />
    </PageShell>
  );
}
