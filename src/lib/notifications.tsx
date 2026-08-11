import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listEvents } from "@/lib/school.functions";

const DISMISS_KEY = "lumen-notif-dismissed";
const FIRED_KEY = "lumen-notif-fired";

type Perm = "default" | "granted" | "denied" | "unsupported";

export function useNotificationPermission() {
  const [perm, setPerm] = useState<Perm>("unsupported");
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission as Perm);
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const request = useCallback(async () => {
    if (!("Notification" in window)) return;
    const res = await Notification.requestPermission();
    setPerm(res as Perm);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }, []);

  return { perm, dismissed, request, dismiss };
}

/** Top banner asking the user to allow notifications. */
export function NotificationBanner() {
  const { perm, dismissed, request, dismiss } = useNotificationPermission();
  if (perm !== "default" || dismissed) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-accent/50 text-sm">
      <Bell className="w-4 h-4 text-primary shrink-0" />
      <span className="flex-1 min-w-0">
        Allow Lumen to send notifications for your planner reminders?
      </span>
      <button
        onClick={request}
        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
      >
        Allow
      </button>
      <button onClick={dismiss} className="px-2 py-1.5 rounded-lg hover:bg-accent text-xs">
        Not now
      </button>
      <button onClick={dismiss} className="p-1 rounded hover:bg-accent" aria-label="Close">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function firedSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function markFired(key: string) {
  const s = firedSet();
  s.add(key);
  localStorage.setItem(FIRED_KEY, JSON.stringify(Array.from(s).slice(-200)));
}

type Ev = {
  id: string; title: string; location: string | null;
  starts_at: string; reminder_minutes: number | null; event_type: string;
};

/** Polls planner events and fires a browser notification at the reminder time. */
export function usePlannerNotifications() {
  const listFn = useServerFn(listEvents);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let stopped = false;

    const schedule = async () => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      let rows: Ev[] = [];
      try {
        rows = (await listFn()) as Ev[];
      } catch {
        return;
      }
      if (stopped) return;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const now = Date.now();
      const fired = firedSet();

      for (const e of rows) {
        const start = new Date(e.starts_at).getTime();
        const lead = (e.reminder_minutes ?? 0) * 60_000;
        const at = start - lead;
        const key = `${e.id}:${at}`;
        if (fired.has(key)) continue;
        const delay = at - now;
        if (delay < -60_000 || delay > 60 * 60_000) continue; // only next hour
        const t = setTimeout(() => {
          markFired(key);
          try {
            new Notification(e.title, {
              body: `${new Date(e.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${e.location ? ` · ${e.location}` : ""}`,
              tag: e.id,
            });
          } catch {
            /* ignore */
          }
        }, Math.max(0, delay));
        timers.current.push(t);
      }
    };

    schedule();
    const iv = setInterval(schedule, 5 * 60_000);
    return () => {
      stopped = true;
      clearInterval(iv);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [listFn]);
}
