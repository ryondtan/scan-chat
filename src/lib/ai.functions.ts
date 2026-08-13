import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiMode =
  | "chat"
  | "summarize"
  | "explain"
  | "quiz"
  | "flashcards"
  | "rewrite"
  | "translate"
  | "doc-qa";

const SYSTEM_PROMPTS: Record<AiMode, string> = {
  chat: "You are Lumen, an expert study assistant for students. Answer with markdown: open with a one-sentence direct answer, then short sections or bullets with the reasoning, worked examples, and a bolded key takeaway. Show every step for maths and science, define jargon inline, never invent facts (say what you are unsure about), and end with one short follow-up question or next study step. Format maths with simple inline LaTeX between $...$ (or plain text); never use \\overset, \\phantom, array/aligned environments or hand-drawn column layouts. Match the student's language and level.",
  summarize: "Summarize the text for revision. Return markdown: a 1-2 sentence **TL;DR**, then grouped bullet points of the key ideas, a short **Key terms** list with definitions, and **Likely exam questions** (3). Keep the author's facts only.",
  explain: "Explain the problem or concept step-by-step in plain language. Structure: **What is being asked**, **Key idea**, numbered **Steps** with the reasoning behind each, **Answer**, then a one-line takeaway and a similar practice question. Show all working. Use markdown.",
  quiz: "Generate a practice quiz from the topic or text: 5 questions of mixed difficulty (multiple-choice with 4 plausible options, plus short-answer). Put all answers with brief explanations in an **Answers** section at the end, never inline. Use clean markdown.",
  flashcards: "Create study flashcards from the input. Return a markdown list where each item is formatted as `**Q:** question — **A:** answer`. Aim for 8-12 cards covering the most important ideas.",
  rewrite: "Rewrite the user's text to be clearer, more concise, and grammatically polished while keeping the original meaning and tone. Return only the rewritten text.",
  translate: "Translate the user's text into the requested target language. If no language is specified, translate to English. Return only the translation.",
  "doc-qa": "You answer questions strictly using the provided document. If the answer is not in the document, say so honestly. Cite short quotes when useful.",
};

type ChatTurn = { role: "user" | "assistant"; content: string };

async function callGemini(
  apiKey: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>,
) {
  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "google/gemini-3.6-flash", messages }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error("The AI took too long to respond. Please try again.");
  }
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
    throw new Error(`AI failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const out = json.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("The AI returned an empty answer. Try rephrasing your request.");
  return out;
}

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as {
      mode?: AiMode;
      input?: string;
      context?: string;
      targetLanguage?: string;
      fileId?: string;
      persist?: boolean;
    };
    const mode = (d?.mode ?? "chat") as AiMode;
    if (!SYSTEM_PROMPTS[mode]) throw new Error("Unknown mode");
    if (!d?.input?.trim() && mode !== "doc-qa") throw new Error("Input is required");
    return {
      mode,
      input: (d.input ?? "").trim().slice(0, 8000),
      context: (d.context ?? mode).slice(0, 60),
      targetLanguage: d.targetLanguage?.trim().slice(0, 40) || null,
      fileId: d.fileId?.trim() || null,
      persist: d.persist !== false,
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");

    let systemPrompt = SYSTEM_PROMPTS[data.mode];
    if (data.mode === "translate" && data.targetLanguage) {
      systemPrompt += ` Target language: ${data.targetLanguage}.`;
    }

    // Load the most recent chat turns for conversational modes
    const history: ChatTurn[] =
      data.mode === "chat"
        ? (
            (await context.supabase
              .from("tutor_messages")
              .select("role, content")
              .eq("user_id", context.userId)
              .eq("context", data.context)
              .order("created_at", { ascending: false })
              .limit(20)).data ?? []
          )
            .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }))
            .filter((r) => r.role === "user" || r.role === "assistant")
            .reverse()
        : [];

    // Build user content — optionally include a document attachment
    let userContent: unknown = data.input;
    if (data.mode === "doc-qa" && data.fileId) {
      const { data: file, error: fErr } = await context.supabase
        .from("user_files")
        .select("path, name, mime_type")
        .eq("id", data.fileId)
        .single();
      if (fErr || !file) throw new Error("File not found");
      const signed = await context.supabase.storage
        .from("user-files")
        .createSignedUrl(file.path, 300);
      if (signed.error || !signed.data) throw new Error("Failed to read file");

      // Download and inline as base64 (works for PDFs/images with Gemini)
      const dl = await fetch(signed.data.signedUrl);
      const buf = await dl.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const mime = file.mime_type || "application/octet-stream";
      const question = data.input.trim() || "Summarize this document and highlight the key points.";

      if (mime.startsWith("image/")) {
        userContent = [
          { type: "text", text: question },
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
        ];
      } else {
        userContent = [
          { type: "text", text: question },
          { type: "file", file: { filename: file.name, file_data: `data:${mime};base64,${b64}` } },
        ];
      }
    }

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userContent },
    ];

    const reply = await callGemini(apiKey, messages);

    if (data.persist && data.mode === "chat") {
      await context.supabase.from("tutor_messages").insert([
        { user_id: context.userId, role: "user", content: data.input, context: data.context },
        { user_id: context.userId, role: "assistant", content: reply, context: data.context },
      ]);
    }

    return { reply };
  });

export const listAssistantMessages = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => {
    const d = raw as { context?: string };
    return { context: (d?.context ?? "ask-ai").slice(0, 60) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tutor_messages")
      .select("id, role, content, created_at")
      .eq("user_id", context.userId)
      .eq("context", data.context)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const clearAssistantMessages = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { context?: string };
    return { context: (d?.context ?? "ask-ai").slice(0, 60) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tutor_messages")
      .delete()
      .eq("user_id", context.userId)
      .eq("context", data.context);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listUserFilesLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_files")
      .select("id, name, mime_type")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
