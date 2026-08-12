import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Turns anything thrown (Error, Supabase error object, string) into readable text. */
export function errMsg(e: unknown, fallback = "Something went wrong"): string {
  if (!e) return fallback;
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const o = e as { message?: unknown; error_description?: unknown; details?: unknown; hint?: unknown };
    const m = o.message ?? o.error_description ?? o.details ?? o.hint;
    if (typeof m === "string" && m.trim()) return m;
    try { return JSON.stringify(e).slice(0, 300); } catch { return fallback; }
  }
  return String(e);
}
