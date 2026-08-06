const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateJoinCode(len = 6) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export const GROUP_AI_SYSTEM_PROMPT =
  "You are Lumen, the shared AI study assistant for a student study group. Several students share this conversation, so keep answers clear, neutral and useful for everyone. Use markdown. Be concise but thorough.";

export const QUIZ_SYSTEM_PROMPT =
  'You generate multiple-choice quizzes. Reply with ONLY valid JSON (no markdown fences) of the shape {"questions":[{"question":string,"options":[string,string,string,string],"answer":number}]} where "answer" is the 0-based index of the correct option. Generate exactly the requested number of questions.';

export const FLASHCARD_SYSTEM_PROMPT =
  'You generate study flashcards. Reply with ONLY valid JSON (no markdown fences) of the shape {"cards":[{"front":string,"back":string}]}. Keep fronts short questions and backs concise answers.';

export function parseJsonBlock(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("AI returned an unexpected format. Try again.");
  }
}

export async function callLovableAi(
  apiKey: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "google/gemini-3.6-flash", messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
    throw new Error(`AI failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const out = json.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("Empty AI response");
  return out;
}

export function formatBytes(n: number | null | undefined) {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
