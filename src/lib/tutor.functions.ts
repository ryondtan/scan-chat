import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type TutorMsg = { role: "user" | "assistant"; content: string };

export const listTutorMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tutor_messages")
      .select("id, role, content, created_at")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const clearTutorMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("tutor_messages")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTutorMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const d = input as { content?: unknown };
    if (typeof d?.content !== "string" || !d.content.trim()) {
      throw new Error("Message is required");
    }
    if (d.content.length > 4000) throw new Error("Message too long");
    return { content: d.content.trim() };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");

    // Persist user message
    const { error: insErr } = await context.supabase
      .from("tutor_messages")
      .insert({ user_id: context.userId, role: "user", content: data.content });
    if (insErr) throw new Error(insErr.message);

    // Load recent history for context
    const { data: history } = await context.supabase
      .from("tutor_messages")
      .select("role, content")
      .order("created_at", { ascending: true })
      .limit(40);

    const messages: TutorMsg[] = [
      {
        role: "assistant",
        content:
          "SYSTEM: You are Lumen, a patient, expert AI tutor for students. Teach rather than just answer: start with a one-line direct answer, then walk through the reasoning step-by-step with a concrete example, define any jargon, and finish with a bolded takeaway plus one check-for-understanding question. Show full working for maths and science. Be honest when unsure, never fabricate sources, keep it concise, and use markdown. Match the student's language and level.",
      },
      ...((history ?? []) as TutorMsg[]),
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: messages.map((m) => ({
          role: m.role === "assistant" && m.content.startsWith("SYSTEM: ") ? "system" : m.role,
          content: m.content.startsWith("SYSTEM: ") ? m.content.slice(8) : m.content,
        })),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
      throw new Error(`AI request failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = json.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Empty AI response");

    const { error: aErr } = await context.supabase
      .from("tutor_messages")
      .insert({ user_id: context.userId, role: "assistant", content: reply });
    if (aErr) throw new Error(aErr.message);

    return { reply };
  });
