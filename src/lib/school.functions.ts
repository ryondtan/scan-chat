import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- HOMEWORK ----------
export const listHomework = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("homework_items")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createHomework = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { title?: string; subject?: string; description?: string; due_date?: string | null; priority?: string };
    if (!d?.title?.trim()) throw new Error("Title is required");
    return {
      title: d.title.trim().slice(0, 200),
      subject: d.subject?.trim().slice(0, 80) || null,
      description: d.description?.trim().slice(0, 2000) || null,
      due_date: d.due_date || null,
      priority: (d.priority as string) || "normal",
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("homework_items")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleHomework = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { id: string; completed: boolean };
    if (!d?.id) throw new Error("id required");
    return { id: d.id, completed: !!d.completed };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("homework_items")
      .update({ completed: data.completed, completed_at: data.completed ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteHomework = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { id: string };
    if (!d?.id) throw new Error("id required");
    return { id: d.id };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("homework_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- EVENTS ----------
export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("planner_events")
      .select("*")
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createEvent = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as {
      title?: string; description?: string; event_type?: string;
      location?: string; starts_at?: string; ends_at?: string | null; reminder_minutes?: number | null;
    };
    if (!d?.title?.trim()) throw new Error("Title is required");
    if (!d?.starts_at) throw new Error("Start time is required");
    return {
      title: d.title.trim().slice(0, 200),
      description: d.description?.trim().slice(0, 2000) || null,
      event_type: (d.event_type as string) || "personal",
      location: d.location?.trim().slice(0, 200) || null,
      starts_at: d.starts_at,
      ends_at: d.ends_at || null,
      reminder_minutes: typeof d.reminder_minutes === "number" ? d.reminder_minutes : null,
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("planner_events")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { id: string };
    if (!d?.id) throw new Error("id required");
    return { id: d.id };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("planner_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- DASHBOARD ----------
export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
    const in7 = new Date(now); in7.setDate(in7.getDate() + 7);

    const [profile, todayEvents, dueToday, upcomingQuizzes, recentNotes] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).single(),
      context.supabase.from("planner_events").select("*")
        .gte("starts_at", startOfDay.toISOString()).lte("starts_at", endOfDay.toISOString())
        .order("starts_at", { ascending: true }),
      context.supabase.from("homework_items").select("*")
        .eq("completed", false)
        .gte("due_date", startOfDay.toISOString()).lte("due_date", endOfDay.toISOString())
        .order("due_date", { ascending: true }),
      context.supabase.from("planner_events").select("*")
        .eq("event_type", "quiz")
        .gte("starts_at", now.toISOString()).lte("starts_at", in7.toISOString())
        .order("starts_at", { ascending: true }),
      context.supabase.from("tutor_messages").select("id, content, created_at, role")
        .eq("role", "assistant")
        .order("created_at", { ascending: false }).limit(3),
    ]);

    return {
      profile: profile.data,
      todayEvents: todayEvents.data ?? [],
      dueToday: dueToday.data ?? [],
      upcomingQuizzes: upcomingQuizzes.data ?? [],
      recentNotes: recentNotes.data ?? [],
    };
  });

// ---------- AI Quick Ask ----------
export const quickAsk = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { question?: string };
    if (!d?.question?.trim()) throw new Error("Ask something");
    return { question: d.question.trim().slice(0, 500) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: "You are Lumen, a helpful study assistant. Answer briefly and clearly in 2-4 sentences." },
          { role: "user", content: data.question },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Rate limit reached, try again shortly");
      if (res.status === 402) throw new Error("AI credits exhausted");
      throw new Error(`AI failed (${res.status})`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { answer: json.choices?.[0]?.message?.content?.trim() ?? "" };
  });
