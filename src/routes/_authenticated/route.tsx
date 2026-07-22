import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Users, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const tabs = [
  { to: "/chats", label: "Chats", icon: MessageCircle },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/me", label: "Me", icon: User },
] as const;

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inChat = /^\/chats\/[^/]+$/.test(pathname);
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 flex flex-col min-h-0 pb-16">
        <Outlet />
      </main>
      {!inChat && (
        <nav className="fixed bottom-0 inset-x-0 h-16 border-t bg-card/95 backdrop-blur flex z-40">
          {tabs.map((t) => {
            const active = pathname === t.to || (t.to === "/chats" && pathname.startsWith("/chats"));
            const Icon = t.icon;
            return (
              <Link key={t.to} to={t.to}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="w-5 h-5" />
                <span>{t.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}
