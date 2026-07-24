import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, ComingSoon } from "@/lib/page-shell";
import { MessagesSquare, BookOpen, StickyNote, Brain, Sparkles, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — Lumen" },
      { name: "description", content: "Your AI learning workspace. Jump into the tutor, homework, notes, flashcards, or quizzes." },
    ],
  }),
  component: Dashboard,
});

const tiles = [
  { to: "/tutor", label: "AI Tutor", desc: "Ask questions, get explanations.", icon: MessagesSquare },
  { to: "/homework", label: "Homework", desc: "Walk through problems step by step.", icon: BookOpen },
  { to: "/notes", label: "Notes", desc: "Capture and organize what you learn.", icon: StickyNote },
  { to: "/flashcards", label: "Flashcards", desc: "Review with spaced repetition.", icon: Brain },
  { to: "/quiz", label: "Quiz Generator", desc: "Turn any topic into a quiz.", icon: Sparkles },
  { to: "/teacher", label: "Teacher", desc: "Manage classes and assignments.", icon: GraduationCap },
] as const;

function Dashboard() {
  return (
    <PageShell title="Welcome back" description="Pick up where you left off, or start something new." actions={<ComingSoon />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group rounded-xl border p-5 bg-card hover:border-primary/40 hover:shadow-sm transition"
          >
            <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center mb-3">
              <t.icon className="w-5 h-5 text-accent-foreground" />
            </div>
            <div className="font-medium group-hover:text-primary transition">{t.label}</div>
            <div className="mt-1 text-sm text-muted-foreground">{t.desc}</div>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
