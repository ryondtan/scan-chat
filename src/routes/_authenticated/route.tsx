import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Home,
  MessagesSquare,
  BookOpen,
  StickyNote,
  Brain,
  Sparkles,
  GraduationCap,
  Settings,
  LogOut,
  MessageCircle,
  CalendarDays,
  FolderOpen,
  Users,
} from "lucide-react";
import { AskAIButton } from "@/components/ask-ai";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/tutor", label: "AI Tutor", icon: MessagesSquare },
  { to: "/chats", label: "Chats", icon: MessageCircle },
  { to: "/groups", label: "Study Groups", icon: Users },
  { to: "/notes", label: "Notes", icon: StickyNote },
  { to: "/homework", label: "Homework", icon: BookOpen },
  { to: "/flashcards", label: "Flashcards", icon: Brain },
  { to: "/quiz", label: "Quiz", icon: Sparkles },
  { to: "/planner", label: "Planner", icon: CalendarDays },
  { to: "/files", label: "Files", icon: FolderOpen },
  
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthenticatedLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center gap-2 px-3 bg-card/50 backdrop-blur sticky top-0 z-30">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground">Lumen</span>
          </header>
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
          <AskAIButton />
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const signOut = useSignOut();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-7 h-7 rounded-md bg-primary grid place-items-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && <span className="font-semibold">Lumen</span>}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const active =
                  pathname === item.to || pathname.startsWith(item.to + "/");
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link to={item.to} className="flex items-center gap-2">
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out">
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}
