import { createFileRoute } from "@tanstack/react-router";
import { PageShell, EmptyState, ComingSoon } from "@/lib/page-shell";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/teacher")({
  head: () => ({
    meta: [
      { title: "Teacher Dashboard — Lumen" },
      { name: "description", content: "Create classes, assign work, and track student progress." },
    ],
  }),
  component: TeacherPage,
});

function TeacherPage() {
  return (
    <PageShell title="Teacher Dashboard" description="Manage classes, assignments, and student progress." actions={<ComingSoon />}>
      <EmptyState
        icon={GraduationCap}
        title="No classes yet"
        description="Class management, assignments, and analytics will appear here."
      />
    </PageShell>
  );
}
