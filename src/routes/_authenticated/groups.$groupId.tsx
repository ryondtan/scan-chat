import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell } from "@/lib/page-shell";
import { MessageCircle, LogOut, Trash2 } from "lucide-react";
import { getGroup, leaveGroup, deleteGroup } from "@/lib/groups.functions";
import type { GroupMember, StudyGroup } from "@/lib/groups-types";
import { Loading } from "@/components/groups/content-panels";
import { MembersPanel } from "@/components/groups/study-panels";
import { ChannelsPanel } from "@/components/groups/channels-panel";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/groups/$groupId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Study Group — Lumen" },
      { name: "description", content: "Group channels, voice rooms and chat for your study group." },
      { property: "og:title", content: "Study Group — Lumen" },
      { property: "og:description", content: "Text and voice channels for your study group." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupDetailPage,
});

const TABS = ["Channels", "Members"] as const;
type Tab = (typeof TABS)[number];

function GroupDetailPage() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getGroup);
  const leaveFn = useServerFn(leaveGroup);
  const delFn = useServerFn(deleteGroup);

  const [state, setState] = useState<null | { group: StudyGroup; members: GroupMember[]; myRole: string }>(null);
  const [tab, setTab] = useState<Tab>("Channels");
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);


  const load = useCallback(() => {
    getFn({ data: { groupId } })
      .then((r) => setState(r as unknown as { group: StudyGroup; members: GroupMember[]; myRole: string }))
      .catch((e) => {
        toast.errorerrMsg(e);
        navigate({ to: "/groups" });
      });
  }, [getFn, groupId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  if (!state) return <div className="p-8"><Loading /></div>;

  const { group, members, myRole } = state;
  const isAdmin = myRole === "owner" || myRole === "admin";

  return (
    <PageShell
      title={group.name}
      description={group.description ?? `${members.length} member${members.length === 1 ? "" : "s"}${group.subject ? ` · ${group.subject}` : ""}`}
      actions={
        <div className="flex flex-wrap gap-2">
          {group.conversation_id && (
            <Link
              to="/chats/$conversationId"
              params={{ conversationId: group.conversation_id }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
            >
              <MessageCircle className="w-4 h-4" /> Group chat
            </Link>
          )}
          {myRole === "owner" ? (
            <button
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-destructive"
              onClick={async () => {
                if (!confirm("Delete this group and everything shared in it?")) return;
                await delFn({ data: { groupId } });
                navigate({ to: "/groups" });
              }}
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          ) : (
            <button
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
              onClick={async () => {
                await leaveFn({ data: { groupId } });
                navigate({ to: "/groups" });
              }}
            >
              <LogOut className="w-4 h-4" /> Leave
            </button>
          )}
        </div>
      }
    >
      <div className="mb-5 flex gap-1 overflow-x-auto border-b pb-px">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm rounded-t-lg whitespace-nowrap border-b-2 -mb-px ${
              tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Channels" && (myId
        ? <ChannelsPanel groupId={groupId} members={members} isAdmin={isAdmin} myId={myId} />
        : <Loading />)}
      {tab === "Members" && (
        <MembersPanel
          groupId={groupId}
          members={members}
          joinCode={group.join_code}
          isAdmin={isAdmin}
          onChanged={load}
        />
      )}
    </PageShell>
  );
}
