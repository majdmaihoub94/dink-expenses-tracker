import type { Profile } from "@/lib/types";

const SIZES = {
  sm: "h-7 w-7 text-[13px]",
  md: "h-9 w-9 text-base",
  lg: "h-12 w-12 text-xl",
} as const;

export function Avatar({
  profile,
  size = "md",
  ring = false,
}: {
  profile: Pick<Profile, "display_name" | "emoji" | "color">;
  size?: keyof typeof SIZES;
  ring?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${SIZES[size]} ${
        ring ? "ring-2 ring-white" : ""
      }`}
      style={{ backgroundColor: `${profile.color}22` }}
      title={profile.display_name}
      aria-hidden
    >
      {profile.emoji}
    </span>
  );
}

/** Overlapping stack of household members, used in headers. */
export function AvatarStack({ profiles }: { profiles: Profile[] }) {
  return (
    <div className="flex -space-x-2">
      {profiles.map((p) => (
        <Avatar key={p.id} profile={p} size="sm" ring />
      ))}
    </div>
  );
}
