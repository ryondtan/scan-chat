import type { Profile } from "@/lib/chat-api";

export function Avatar({ profile, size = 48 }: { profile: Pick<Profile, "display_name" | "username" | "avatar_url">; size?: number }) {
  const initial = (profile.display_name || profile.username || "?")[0]?.toUpperCase();
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0">
      {initial}
    </div>
  );
}

export function GroupAvatar({ name, size = 48 }: { name: string | null; size?: number }) {
  const initial = (name || "#")[0]?.toUpperCase() ?? "#";
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-accent text-accent-foreground font-semibold flex items-center justify-center shrink-0">
      {initial}
    </div>
  );
}
