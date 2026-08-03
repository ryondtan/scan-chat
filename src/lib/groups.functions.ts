import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateJoinCode,
  callLovableAi,
  parseJsonBlock,
  GROUP_AI_SYSTEM_PROMPT,
  QUIZ_SYSTEM_PROMPT,
  FLASHCARD_SYSTEM_PROMPT,
} from "@/lib/groups-helpers";
import type { StudyGroup, GroupCard } from "@/lib/groups-types";

/* ============================ GROUPS ============================ */

export const listMyGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: memberships, error } = await context.supabase
      .from("study_group_members")
      .select("group_id, role, study_groups(*)")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    const ids = (memberships ?? []).map((m) => m.group_id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: all } = await context.supabase
        .from("study_group_members")
        .select("group_id")
        .in("group_id", ids);
      for (const r of all ?? []) counts.set(r.group_id, (counts.get(r.group_id) ?? 0) + 1);
    }

    return (memberships ?? [])
      .filter((m) => m.study_groups)
      .map((m) => ({
        ...(m.study_groups as unknown as StudyGroup),
        role: m.role,
        member_count: counts.get(m.group_id) ?? 1,
      }));
  });

export const createGroup = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { name?: string; description?: string; subject?: string };
    if (!d?.name?.trim()) throw new Error("Group name is required");
    return {
      name: d.name.trim().slice(0, 100),
      description: d.description?.trim().slice(0, 500) || null,
      subject: d.subject?.trim().slice(0, 80) || null,
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations")
      .insert({ type: "group", name: data.name, created_by: context.userId })
      .select("id")
      .single();
    if (conv) {
      await context.supabase
        .from("conversation_members")
        .insert({ conversation_id: conv.id, user_id: context.userId, role: "owner" });
    }

    let group: StudyGroup | null = null;
    let lastError = "Could not create group";
    for (let attempt = 0; attempt < 5 && !group; attempt++) {
      const { data: row, error } = await context.supabase
        .from("study_groups")
        .insert({
          ...data,
          join_code: generateJoinCode(),
          created_by: context.userId,
          conversation_id: conv?.id ?? null,
        })
        .select()
        .single();
      if (row) group = row as StudyGroup;
      else lastError = error?.message ?? lastError;
    }
    if (!group) throw new Error(lastError);

    const { error: mErr } = await context.supabase
      .from("study_group_members")
      .insert({ group_id: group.id, user_id: context.userId, role: "owner" });
    if (mErr) throw new Error(mErr.message);

    return group;
  });

export const joinGroupByCode = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { code?: string };
    const code = d?.code?.trim().toUpperCase();
    if (!code) throw new Error("Enter a join code");
    return { code: code.slice(0, 12) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: group, error } = await context.supabase
      .from("study_groups")
      .select("*")
      .eq("join_code", data.code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!group) throw new Error("No group found with that code");

    await context.supabase
      .from("study_group_members")
      .upsert({ group_id: group.id, user_id: context.userId, role: "member" }, { onConflict: "group_id,user_id" });

    if (group.conversation_id) {
      await context.supabase
        .from("conversation_members")
        .upsert(
          { conversation_id: group.conversation_id, user_id: context.userId, role: "member" },
          { onConflict: "conversation_id,user_id" },
        );
    }
    return group;
  });

export const getGroup = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => {
    const d = raw as { groupId?: string };
    if (!d?.groupId) throw new Error("Missing group");
    return { groupId: d.groupId };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: members, error: mErr } = await context.supabase
      .from("study_group_members")
      .select("user_id, role, joined_at, profiles(id, username, display_name, avatar_url)")
      .eq("group_id", data.groupId)
      .order("joined_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);
    if (!(members ?? []).some((m) => m.user_id === context.userId)) {
      throw new Error("You are not a member of this group");
    }

    const { data: group, error } = await context.supabase
      .from("study_groups")
      .select("*")
      .eq("id", data.groupId)
      .single();
    if (error) throw new Error(error.message);

    return {
      group,
      members: (members ?? []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        profile: m.profiles ?? null,
      })),
      myRole: (members ?? []).find((m) => m.user_id === context.userId)?.role ?? "member",
    };
  });

export const updateGroup = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { groupId?: string; name?: string; description?: string; subject?: string };
    if (!d?.groupId) throw new Error("Missing group");
    return {
      groupId: d.groupId,
      name: d.name?.trim().slice(0, 100) || undefined,
      description: d.description?.trim().slice(0, 500) ?? undefined,
      subject: d.subject?.trim().slice(0, 80) ?? undefined,
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const patch: { name?: string; description?: string | null; subject?: string | null } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.subject !== undefined) patch.subject = data.subject || null;
    const { error } = await context.supabase.from("study_groups").update(patch).eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("study_groups").delete().eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("study_group_members")
      .delete()
      .eq("group_id", data.groupId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { groupId?: string; userId?: string };
    if (!d?.groupId || !d?.userId) throw new Error("Missing member");
    return { groupId: d.groupId, userId: d.userId };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("study_group_members")
      .delete()
      .eq("group_id", data.groupId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ INVITE FRIENDS ============ */

export const listInvitableFriends = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: friends, error } = await context.supabase
      .from("friendships")
      .select("friend_id, profiles!friendships_friend_id_fkey(id, username, display_name, avatar_url)")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    const { data: members } = await context.supabase
      .from("study_group_members")
      .select("user_id")
      .eq("group_id", data.groupId);
    const inGroup = new Set((members ?? []).map((m) => m.user_id));

    return (friends ?? [])
      .filter((f) => f.profiles && !inGroup.has(f.friend_id))
      .map((f) => f.profiles);
  });

export const inviteFriendToGroup = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { groupId?: string; userId?: string };
    if (!d?.groupId || !d?.userId) throw new Error("Missing friend");
    return { groupId: d.groupId, userId: d.userId };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("study_group_members")
      .upsert({ group_id: data.groupId, user_id: data.userId, role: "member" }, { onConflict: "group_id,user_id" });
    if (error) throw new Error(error.message);

    const { data: group } = await context.supabase
      .from("study_groups")
      .select("conversation_id")
      .eq("id", data.groupId)
      .single();
    if (group?.conversation_id) {
      await context.supabase
        .from("conversation_members")
        .upsert(
          { conversation_id: group.conversation_id, user_id: data.userId, role: "member" },
          { onConflict: "conversation_id,user_id" },
        );
    }
    return { ok: true };
  });

/* ============================ NOTES ============================ */

export const listGroupNotes = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("group_notes")
      .select("*")
      .eq("group_id", data.groupId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveGroupNote = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { id?: string; groupId?: string; title?: string; content?: string };
    if (!d?.groupId) throw new Error("Missing group");
    if (!d?.title?.trim()) throw new Error("Title is required");
    return {
      id: d.id || null,
      groupId: d.groupId,
      title: d.title.trim().slice(0, 200),
      content: (d.content ?? "").slice(0, 20000),
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("group_notes")
        .update({ title: data.title, content: data.content })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("group_notes")
      .insert({ group_id: data.groupId, author_id: context.userId, title: data.title, content: data.content })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteGroupNote = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ id: (raw as { id: string }).id }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("group_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ FILES ============================ */

export const listGroupFiles = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("group_files")
      .select("*")
      .eq("group_id", data.groupId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const registerGroupFile = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as {
      groupId?: string;
      name?: string;
      path?: string;
      size_bytes?: number;
      mime_type?: string;
    };
    if (!d?.groupId || !d?.path || !d?.name) throw new Error("Missing file details");
    return {
      groupId: d.groupId,
      name: d.name.slice(0, 300),
      path: d.path,
      size_bytes: d.size_bytes ?? null,
      mime_type: d.mime_type ?? null,
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("group_files")
      .insert({
        group_id: data.groupId,
        uploader_id: context.userId,
        name: data.name,
        path: data.path,
        size_bytes: data.size_bytes,
        mime_type: data.mime_type,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getGroupFileUrl = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ id: (raw as { id: string }).id }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: file, error } = await context.supabase
      .from("group_files")
      .select("path")
      .eq("id", data.id)
      .single();
    if (error || !file) throw new Error("File not found");
    const signed = await context.supabase.storage.from("group-files").createSignedUrl(file.path, 300);
    if (signed.error || !signed.data) throw new Error("Could not open file");
    return { url: signed.data.signedUrl };
  });

export const deleteGroupFile = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ id: (raw as { id: string }).id }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: file } = await context.supabase
      .from("group_files")
      .select("path")
      .eq("id", data.id)
      .single();
    const { error } = await context.supabase.from("group_files").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (file?.path) await context.supabase.storage.from("group-files").remove([file.path]);
    return { ok: true };
  });

/* ============================ TASKS ============================ */

export const listGroupTasks = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("group_tasks")
      .select("*")
      .eq("group_id", data.groupId)
      .order("completed", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createGroupTask = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as {
      groupId?: string;
      title?: string;
      description?: string;
      assigned_to?: string | null;
      due_date?: string | null;
    };
    if (!d?.groupId) throw new Error("Missing group");
    if (!d?.title?.trim()) throw new Error("Task title is required");
    return {
      groupId: d.groupId,
      title: d.title.trim().slice(0, 200),
      description: d.description?.trim().slice(0, 2000) || null,
      assigned_to: d.assigned_to || null,
      due_date: d.due_date || null,
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("group_tasks")
      .insert({
        group_id: data.groupId,
        created_by: context.userId,
        title: data.title,
        description: data.description,
        assigned_to: data.assigned_to,
        due_date: data.due_date,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleGroupTask = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { id?: string; completed?: boolean };
    if (!d?.id) throw new Error("Missing task");
    return { id: d.id, completed: !!d.completed };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("group_tasks")
      .update({ completed: data.completed, completed_at: data.completed ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGroupTask = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ id: (raw as { id: string }).id }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("group_tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ PLANNER ============================ */

export const listGroupEvents = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("group_events")
      .select("*")
      .eq("group_id", data.groupId)
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createGroupEvent = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as {
      groupId?: string;
      title?: string;
      description?: string;
      location?: string;
      starts_at?: string;
      ends_at?: string | null;
    };
    if (!d?.groupId) throw new Error("Missing group");
    if (!d?.title?.trim()) throw new Error("Event title is required");
    if (!d?.starts_at) throw new Error("Start time is required");
    return {
      groupId: d.groupId,
      title: d.title.trim().slice(0, 200),
      description: d.description?.trim().slice(0, 2000) || null,
      location: d.location?.trim().slice(0, 200) || null,
      starts_at: d.starts_at,
      ends_at: d.ends_at || null,
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("group_events")
      .insert({
        group_id: data.groupId,
        created_by: context.userId,
        title: data.title,
        description: data.description,
        location: data.location,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteGroupEvent = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ id: (raw as { id: string }).id }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("group_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ FLASHCARDS ============================ */

export const listGroupDecks = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: decks, error } = await context.supabase
      .from("group_decks")
      .select("*, group_cards(id, deck_id, front, back)")
      .eq("group_id", data.groupId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (decks ?? []).map((d) => {
      const { group_cards, ...rest } = d as unknown as StudyGroupDeckRow;
      return { ...rest, cards: (group_cards ?? []) as GroupCard[] };
    });
  });

export const createGroupDeck = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { groupId?: string; title?: string; subject?: string; topic?: string; count?: number; useAi?: boolean };
    if (!d?.groupId) throw new Error("Missing group");
    if (!d?.title?.trim()) throw new Error("Deck title is required");
    return {
      groupId: d.groupId,
      title: d.title.trim().slice(0, 150),
      subject: d.subject?.trim().slice(0, 80) || null,
      topic: d.topic?.trim().slice(0, 2000) || null,
      count: Math.min(Math.max(d.count ?? 8, 3), 20),
      useAi: !!d.useAi,
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: deck, error } = await context.supabase
      .from("group_decks")
      .insert({ group_id: data.groupId, created_by: context.userId, title: data.title, subject: data.subject })
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (data.useAi && data.topic) {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("AI is not configured");
      const out = await callLovableAi(apiKey, [
        { role: "system", content: FLASHCARD_SYSTEM_PROMPT },
        { role: "user", content: `Create ${data.count} flashcards about: ${data.topic}` },
      ]);
      const parsed = parseJsonBlock(out) as { cards?: { front?: string; back?: string }[] };
      const cards = (parsed.cards ?? [])
        .filter((c) => c.front && c.back)
        .slice(0, 30)
        .map((c) => ({ deck_id: deck.id, front: String(c.front).slice(0, 500), back: String(c.back).slice(0, 1000) }));
      if (cards.length) await context.supabase.from("group_cards").insert(cards);
    }
    return deck;
  });

export const addGroupCard = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { deckId?: string; front?: string; back?: string };
    if (!d?.deckId) throw new Error("Missing deck");
    if (!d?.front?.trim() || !d?.back?.trim()) throw new Error("Front and back are required");
    return { deckId: d.deckId, front: d.front.trim().slice(0, 500), back: d.back.trim().slice(0, 1000) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("group_cards")
      .insert({ deck_id: data.deckId, front: data.front, back: data.back })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteGroupDeck = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ id: (raw as { id: string }).id }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("group_decks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ QUIZZES ============================ */

export const listGroupQuizzes = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("group_quizzes")
      .select("*")
      .eq("group_id", data.groupId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createGroupQuiz = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { groupId?: string; title?: string; topic?: string; count?: number };
    if (!d?.groupId) throw new Error("Missing group");
    if (!d?.topic?.trim()) throw new Error("Describe what the quiz should cover");
    return {
      groupId: d.groupId,
      title: d.title?.trim().slice(0, 150) || d.topic.trim().slice(0, 60),
      topic: d.topic.trim().slice(0, 3000),
      count: Math.min(Math.max(d.count ?? 5, 3), 15),
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");
    const out = await callLovableAi(apiKey, [
      { role: "system", content: QUIZ_SYSTEM_PROMPT },
      { role: "user", content: `Create ${data.count} multiple-choice questions about: ${data.topic}` },
    ]);
    const parsed = parseJsonBlock(out) as {
      questions?: { question?: string; options?: string[]; answer?: number }[];
    };
    const questions = (parsed.questions ?? [])
      .filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2)
      .map((q) => ({
        question: String(q.question),
        options: (q.options ?? []).map((o) => String(o)),
        answer: Math.max(0, Math.min(Number(q.answer ?? 0), (q.options ?? []).length - 1)),
      }));
    if (!questions.length) throw new Error("AI could not build a quiz. Try a different topic.");

    const { data: row, error } = await context.supabase
      .from("group_quizzes")
      .insert({
        group_id: data.groupId,
        created_by: context.userId,
        title: data.title,
        topic: data.topic.slice(0, 200),
        questions,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const recordQuizAttempt = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { quizId?: string; groupId?: string; score?: number; total?: number };
    if (!d?.quizId || !d?.groupId) throw new Error("Missing quiz");
    return { quizId: d.quizId, groupId: d.groupId, score: Number(d.score ?? 0), total: Number(d.total ?? 0) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("group_quiz_attempts").insert({
      quiz_id: data.quizId,
      group_id: data.groupId,
      user_id: context.userId,
      score: data.score,
      total: data.total,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGroupQuiz = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ id: (raw as { id: string }).id }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("group_quizzes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ SHARED AI ============================ */

export const listGroupAiMessages = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("group_ai_messages")
      .select("id, user_id, role, content, created_at")
      .eq("group_id", data.groupId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const askGroupAi = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { groupId?: string; input?: string };
    if (!d?.groupId) throw new Error("Missing group");
    if (!d?.input?.trim()) throw new Error("Ask a question first");
    return { groupId: d.groupId, input: d.input.trim().slice(0, 6000) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const { data: history } = await context.supabase
      .from("group_ai_messages")
      .select("role, content")
      .eq("group_id", data.groupId)
      .order("created_at", { ascending: true })
      .limit(30);

    const reply = await callLovableAi(apiKey, [
      { role: "system", content: GROUP_AI_SYSTEM_PROMPT },
      ...(history ?? []).map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: data.input },
    ]);

    await context.supabase.from("group_ai_messages").insert([
      { group_id: data.groupId, user_id: context.userId, role: "user", content: data.input },
      { group_id: data.groupId, user_id: null, role: "assistant", content: reply },
    ]);

    return { reply };
  });

/* ============================ PROGRESS ============================ */

export const getGroupProgress = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => ({ groupId: (raw as { groupId: string }).groupId }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const [membersRes, tasksRes, attemptsRes, notesRes, filesRes] = await Promise.all([
      context.supabase
        .from("study_group_members")
        .select("user_id, profiles(id, display_name, avatar_url)")
        .eq("group_id", data.groupId),
      context.supabase.from("group_tasks").select("assigned_to, completed").eq("group_id", data.groupId),
      context.supabase.from("group_quiz_attempts").select("user_id, score, total").eq("group_id", data.groupId),
      context.supabase.from("group_notes").select("id", { count: "exact", head: true }).eq("group_id", data.groupId),
      context.supabase.from("group_files").select("id", { count: "exact", head: true }).eq("group_id", data.groupId),
    ]);

    const tasks = tasksRes.data ?? [];
    const attempts = attemptsRes.data ?? [];

    const members = (membersRes.data ?? []).map((m) => {
      const profile = m.profiles as { display_name?: string; avatar_url?: string | null } | null;
      const mine = tasks.filter((t) => t.assigned_to === m.user_id);
      const myAttempts = attempts.filter((a) => a.user_id === m.user_id && a.total > 0);
      const avg = myAttempts.length
        ? Math.round(
            (myAttempts.reduce((s, a) => s + a.score / a.total, 0) / myAttempts.length) * 100,
          )
        : null;
      return {
        user_id: m.user_id,
        display_name: profile?.display_name ?? "Member",
        avatar_url: profile?.avatar_url ?? null,
        tasks_assigned: mine.length,
        tasks_done: mine.filter((t) => t.completed).length,
        quizzes_taken: myAttempts.length,
        avg_score: avg,
      };
    });

    return {
      members,
      totals: {
        tasks: tasks.length,
        tasks_done: tasks.filter((t) => t.completed).length,
        notes: notesRes.count ?? 0,
        files: filesRes.count ?? 0,
        quiz_attempts: attempts.length,
      },
    };
  });

type StudyGroupDeckRow = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  subject: string | null;
  created_at: string;
  updated_at: string;
  group_cards?: GroupCard[];
};
