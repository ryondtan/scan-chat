import { createFileRoute } from "@tanstack/react-router";
import { PageShell, EmptyState, ComingSoon } from "@/lib/page-shell";
import { BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/homework")({
  head: () => ({
    meta: [
      { title: "Homework — Lumen" },
      { name: "description", content: "Get AI help with homework: upload a problem and walk through it step by step." },
    ],
  }),
  component: HomeworkPage,
});

function HomeworkPage() {
  return (
    <PageShell title="Homework" description="Upload a problem or paste a question — we'll walk through it." actions={<ComingSoon />}>
      <EmptyState
        icon={BookOpen}
        title="No homework yet"
        description="Once AI is connected, you'll be able to upload problems, get worked solutions, and save them to your notes."
      />
    </PageShell>
  );
}
