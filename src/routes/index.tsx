import { createFileRoute, Link } from "@tanstack/react-router";
import { Brain, Sparkles, BookOpen, GraduationCap, MessagesSquare, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — AI Learning Workspace for Students" },
      { name: "description", content: "Study smarter with an AI tutor, notes, flashcards, and auto-generated quizzes. Built for students." },
      { property: "og:title", content: "Lumen — AI Learning Platform" },
      { property: "og:description", content: "AI tutor, notes, flashcards, and quizzes in one clean workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <div className="w-8 h-8 rounded-lg bg-primary grid place-items-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            Lumen
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/auth" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
            <Link to="/auth" className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Get started</Link>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground mb-6">
          <Sparkles className="w-3 h-3" /> AI-powered learning
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl mx-auto">
          The AI workspace for students
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Chat with an AI tutor, take notes, generate flashcards, and build quizzes — all in one clean, focused workspace.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/auth" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90">
            Start learning <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/auth" className="px-5 py-2.5 rounded-lg border font-medium hover:bg-accent">
            Sign in
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { icon: MessagesSquare, title: "AI Tutor", desc: "Ask anything and get patient, step-by-step explanations." },
          { icon: BookOpen, title: "Smart Notes", desc: "Organize notes and let AI summarize what matters." },
          { icon: Brain, title: "Flashcards", desc: "Turn any topic into spaced-repetition flashcards." },
          { icon: Sparkles, title: "Quiz Generator", desc: "Auto-generate quizzes from your notes or a topic." },
          { icon: GraduationCap, title: "Study Groups", desc: "Share notes, files, tasks, and a group AI tutor." },
          { icon: ArrowRight, title: "Voice Channels", desc: "Talk, share your screen and study live with your group." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border p-6 bg-card">
            <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center mb-4">
              <f.icon className="w-5 h-5 text-accent-foreground" />
            </div>
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Lumen</span>
          <Link to="/auth" className="hover:text-foreground">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
