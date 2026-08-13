import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

type InputFile = { name: string; mimeType: string; dataBase64: string };

const SYSTEM = `You are Lumen, a study quiz generator. Read the student's material and write a quiz that tests real understanding of it.
Rules:
- Only use facts present in the provided material.
- Each question has exactly 4 plausible options and one correct answer.
- Mix recall, understanding and application questions.
- Keep questions and options short and clear.
Return ONLY valid JSON, no markdown fences, in this shape:
{"title":"string","questions":[{"question":"string","options":["a","b","c","d"],"answerIndex":0,"explanation":"string"}]}`;

export const generateQuizFromFiles = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { files?: InputFile[]; text?: string; count?: number; instructions?: string };
    const files = (d?.files ?? []).slice(0, 5).map((f) => ({
      name: String(f.name ?? "file").slice(0, 200),
      mimeType: String(f.mimeType ?? "application/octet-stream"),
      dataBase64: String(f.dataBase64 ?? ""),
    }));
    const text = String(d?.text ?? "").slice(0, 60000);
    if (!files.length && !text.trim()) throw new Error("Add a file or paste some text first");
    return {
      files,
      text,
      count: Math.min(20, Math.max(3, Number(d?.count) || 10)),
      instructions: String(d?.instructions ?? "").slice(0, 500),
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const parts: unknown[] = [
      {
        type: "text",
        text: `Create a ${data.count}-question multiple-choice quiz from the study material below.${
          data.instructions ? ` Extra instructions: ${data.instructions}` : ""
        }${data.text ? `\n\nPasted material:\n${data.text}` : ""}`,
      },
    ];

    for (const f of data.files) {
      if (!f.dataBase64) continue;
      if (f.mimeType.startsWith("image/")) {
        parts.push({ type: "image_url", image_url: { url: `data:${f.mimeType};base64,${f.dataBase64}` } });
      } else {
        parts.push({
          type: "file",
          file: { filename: f.name, file_data: `data:${f.mimeType};base64,${f.dataBase64}` },
        });
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: parts },
          ],
        }),
      });
    } catch {
      throw new Error("The AI took too long. Try fewer or smaller files.");
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 429) throw new Error("Too many requests right now — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Add credits to continue.");
    if (!res.ok) throw new Error(`AI request failed (${res.status}). Try a smaller or different file.`);

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Could not read a quiz from that material.");

    let parsed: { title?: string; questions?: QuizQuestion[] };
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new Error("Could not read a quiz from that material.");
    }

    const questions = (parsed.questions ?? [])
      .filter((q) => q && typeof q.question === "string" && Array.isArray(q.options) && q.options.length >= 2)
      .map((q) => ({
        question: q.question,
        options: q.options.slice(0, 6).map((o) => String(o)),
        answerIndex: Math.max(0, Math.min((q.options?.length ?? 1) - 1, Number(q.answerIndex) || 0)),
        explanation: String(q.explanation ?? ""),
      }));

    if (!questions.length) throw new Error("No questions could be generated from that material.");

    return { title: String(parsed.title ?? "Practice quiz"), questions };
  });
