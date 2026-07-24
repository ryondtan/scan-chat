import { createFileRoute } from "@tanstack/react-router";
import { PageShell, EmptyState, ComingSoon } from "@/lib/page-shell";
import { StickyNote } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "Notes — Lumen" },
      { name: "description", content: "Capture, organize, and summarize your notes with AI." },
    ],
  }),
  component: NotesPage,
});

function NotesPage() {
  return (
    <PageShell title="Notes" description="Capture ideas, lectures, and readings — let AI summarize what matters." actions={<ComingSoon />}>
      <EmptyState
        icon={StickyNote}
        title="No notes yet"
        description="Your notes will appear here. AI summarization and search will be enabled once connected."
      />
    </PageShell>
  );
}
