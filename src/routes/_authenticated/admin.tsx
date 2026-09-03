import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  fetchAdminUsers,
  fetchAllowedDomains,
  fetchAuditLog,
  fetchPlatformStats,
  addAllowedDomain,
  removeAllowedDomain,
  setStaffRole,
  useIsAdmin,
} from "@/lib/admin-api";
import { ShieldCheck, Users, MessagesSquare, FolderOpen, Loader2, X, Lock } from "lucide-react";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console · Lumen" },
      { name: "description", content: "Owner-only console for Lumen: platform statistics, staff roles, and allowed sign-up domains." },
      { property: "og:title", content: "Admin Console · Lumen" },
      { property: "og:description", content: "Owner-only console for Lumen: platform statistics, staff roles, and allowed sign-up domains." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { data: isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <div className="p-10 flex justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto p-10 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Not available</h1>
        <p className="text-sm text-muted-foreground mt-1">
          This area is restricted. Your account doesn't have access.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Admin console</h1>
          <p className="text-sm text-muted-foreground">
            Aggregate stats and access control only — no private messages or files.
          </p>
        </div>
      </header>

      <StatsGrid />
      <UsersPanel />
      <DomainsPanel />
      <AuditPanel />
    </div>
  );
}

function Card({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="bg-card border rounded-2xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function StatsGrid() {
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-stats"], queryFn: fetchPlatformStats });
  if (isLoading) return <div className="h-24 rounded-2xl border bg-card animate-pulse" />;
  if (error) return <p className="text-sm text-destructive">{errorMessage(error)}</p>;
  if (!data) return null;

  const items = [
    { label: "Users", value: data.users, sub: `+${data.new_users_7d} this week`, icon: Users },
    { label: "Messages", value: data.messages, sub: `${data.messages_24h} in 24h`, icon: MessagesSquare },
    { label: "Study groups", value: data.groups, sub: `${data.conversations} conversations`, icon: Users },
    { label: "Files", value: data.files, sub: `${data.quizzes} quizzes`, icon: FolderOpen },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((i) => (
        <div key={i.label} className="bg-card border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <i.icon className="w-4 h-4" />
            {i.label}
          </div>
          <div className="text-2xl font-semibold mt-2">{i.value}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{i.sub}</div>
        </div>
      ))}
    </div>
  );
}

function UsersPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => fetchAdminUsers(search),
  });

  const mutate = useMutation({
    mutationFn: ({ id, role, enabled }: { id: string; role: "admin" | "moderator"; enabled: boolean }) =>
      setStaffRole(id, role, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-audit"] });
      toast.success("Role updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card title="Members & staff roles">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or username"
        className="w-full px-3 py-2 mb-3 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="divide-y">
          {(data ?? []).map((u) => (
            <div key={u.id} className="py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{u.display_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  @{u.username} · {u.role}
                </p>
              </div>
              {(["admin", "moderator"] as const).map((role) => {
                const active = role === "admin" ? u.is_admin : u.is_moderator;
                return (
                  <button
                    key={role}
                    onClick={() => mutate.mutate({ id: u.id, role, enabled: !active })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {role}
                  </button>
                );
              })}
            </div>
          ))}
          {(data ?? []).length === 0 && <p className="text-sm text-muted-foreground py-2">No members found.</p>}
        </div>
      )}
    </Card>
  );
}

function DomainsPanel() {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const { data } = useQuery({ queryKey: ["allowed-domains"], queryFn: fetchAllowedDomains });

  const add = useMutation({
    mutationFn: () => addAllowedDomain(value),
    onSuccess: () => {
      setValue("");
      qc.invalidateQueries({ queryKey: ["allowed-domains"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (d: string) => removeAllowedDomain(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["allowed-domains"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card title="Allowed sign-up email domains">
      <p className="text-xs text-muted-foreground mb-3">
        Only emails from these domains can create an account. Leave the list empty to allow any domain.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {(data ?? []).map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5 text-xs bg-muted rounded-full pl-3 pr-1.5 py-1">
            @{d}
            <button onClick={() => remove.mutate(d)} className="p-0.5 rounded-full hover:bg-background">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {(data ?? []).length === 0 && <span className="text-xs text-muted-foreground">Any domain allowed</span>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) add.mutate();
        }}
        className="flex gap-2"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="school.edu"
          className="flex-1 px-3 py-2 rounded-lg bg-input border-0 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Add</button>
      </form>
    </Card>
  );
}

function AuditPanel() {
  const { data } = useQuery({ queryKey: ["admin-audit"], queryFn: fetchAuditLog });
  return (
    <Card title="Recent admin actions">
      {(data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No actions recorded yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {(data ?? []).map((a) => (
            <li key={a.id} className="text-xs text-muted-foreground flex justify-between gap-3">
              <span className="truncate">
                {a.action}
                {a.target ? ` · ${a.target}` : ""}
              </span>
              <span className="shrink-0">{new Date(a.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
