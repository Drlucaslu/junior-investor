import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

/** Built-in illustrated avatars, drawn as simple flat SVG (no emoji, no external assets). */

export const AVATAR_IDS = ["owl", "fox", "panda", "cat", "bear", "rabbit", "penguin", "koala"] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

const eyes = (lx: number, rx: number, y: number, r = 2.6) => (
  <>
    <circle cx={lx} cy={y} r={r} fill="#1f2a30" />
    <circle cx={rx} cy={y} r={r} fill="#1f2a30" />
    <circle cx={lx + 0.9} cy={y - 0.9} r={0.8} fill="#fff" />
    <circle cx={rx + 0.9} cy={y - 0.9} r={0.8} fill="#fff" />
  </>
);

const ART: Record<AvatarId, { bg: string; art: ReactElement }> = {
  owl: {
    bg: "#dcecea",
    art: (
      <>
        <path d="M17 22 L21 12 L27 19 Z M47 22 L43 12 L37 19 Z" fill="#8a6246" />
        <ellipse cx="32" cy="38" rx="17" ry="19" fill="#a27552" />
        <ellipse cx="32" cy="44" rx="10" ry="11" fill="#e9d3b5" />
        <circle cx="25" cy="31" r="7" fill="#fff" />
        <circle cx="39" cy="31" r="7" fill="#fff" />
        {eyes(25, 39, 31, 3.4)}
        <path d="M32 34 L29.5 38 L32 40.5 L34.5 38 Z" fill="#f2a541" />
      </>
    ),
  },
  fox: {
    bg: "#fbe6d4",
    art: (
      <>
        <path d="M14 14 L25 24 L18 32 Z M50 14 L39 24 L46 32 Z" fill="#e0732f" />
        <path d="M16.5 18 L22 23.5 L19 27 Z M47.5 18 L42 23.5 L45 27 Z" fill="#3a2a22" />
        <path d="M32 52 C20 50 14 40 16 28 C20 22 26 20 32 20 C38 20 44 22 48 28 C50 40 44 50 32 52 Z" fill="#ec8438" />
        <path d="M32 52 C25 51 20 46 18 38 C23 40 28 42 32 46 C36 42 41 40 46 38 C44 46 39 51 32 52 Z" fill="#fff4ea" />
        {eyes(25.5, 38.5, 34)}
        <ellipse cx="32" cy="45" rx="2.6" ry="2" fill="#1f2a30" />
      </>
    ),
  },
  panda: {
    bg: "#e3efe3",
    art: (
      <>
        <circle cx="18.5" cy="20" r="6.5" fill="#26302f" />
        <circle cx="45.5" cy="20" r="6.5" fill="#26302f" />
        <circle cx="32" cy="35" r="18" fill="#ffffff" />
        <ellipse cx="24.5" cy="34" rx="5" ry="6" transform="rotate(-20 24.5 34)" fill="#26302f" />
        <ellipse cx="39.5" cy="34" rx="5" ry="6" transform="rotate(20 39.5 34)" fill="#26302f" />
        <circle cx="25" cy="33.5" r="1.7" fill="#fff" />
        <circle cx="39" cy="33.5" r="1.7" fill="#fff" />
        <ellipse cx="32" cy="42" rx="3" ry="2.1" fill="#26302f" />
        <path d="M29 45.5 Q32 48 35 45.5" stroke="#26302f" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  cat: {
    bg: "#e5e7f5",
    art: (
      <>
        <path d="M15 14 L27 22 L17 30 Z M49 14 L37 22 L47 30 Z" fill="#8c93a8" />
        <path d="M17.5 18.5 L23.5 22.5 L18.5 26 Z M46.5 18.5 L40.5 22.5 L45.5 26 Z" fill="#f2b8c6" />
        <ellipse cx="32" cy="36" rx="17" ry="16" fill="#9aa1b5" />
        <ellipse cx="32" cy="42" rx="8" ry="6" fill="#eef0f6" />
        {eyes(25, 39, 33)}
        <path d="M30.5 39.5 L33.5 39.5 L32 41.3 Z" fill="#e58a9f" />
        <path d="M14 40 L24 41 M14 44 L24 43 M50 40 L40 41 M50 44 L40 43" stroke="#5d6477" strokeWidth="1.1" strokeLinecap="round" />
      </>
    ),
  },
  bear: {
    bg: "#f3e7d9",
    art: (
      <>
        <circle cx="18" cy="21" r="7" fill="#8b5e3c" />
        <circle cx="46" cy="21" r="7" fill="#8b5e3c" />
        <circle cx="18" cy="21" r="3.5" fill="#c9956b" />
        <circle cx="46" cy="21" r="3.5" fill="#c9956b" />
        <circle cx="32" cy="36" r="17" fill="#9b6a44" />
        <ellipse cx="32" cy="42.5" rx="8.5" ry="6.5" fill="#e3c19c" />
        {eyes(25, 39, 32.5)}
        <ellipse cx="32" cy="40" rx="3" ry="2.2" fill="#2b1f18" />
        <path d="M29.5 44.5 Q32 46.5 34.5 44.5" stroke="#2b1f18" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  rabbit: {
    bg: "#f6e3ea",
    art: (
      <>
        <ellipse cx="24" cy="15" rx="5" ry="12" fill="#f4f1ee" />
        <ellipse cx="40" cy="15" rx="5" ry="12" fill="#f4f1ee" />
        <ellipse cx="24" cy="15.5" rx="2.4" ry="8.5" fill="#f2b8c6" />
        <ellipse cx="40" cy="15.5" rx="2.4" ry="8.5" fill="#f2b8c6" />
        <circle cx="32" cy="38" r="16" fill="#fbf9f7" stroke="#e7e1dc" strokeWidth="1" />
        {eyes(25.5, 38.5, 35)}
        <circle cx="21" cy="41" r="2.8" fill="#f7c9d4" opacity="0.8" />
        <circle cx="43" cy="41" r="2.8" fill="#f7c9d4" opacity="0.8" />
        <path d="M30.5 40.5 L33.5 40.5 L32 42.2 Z" fill="#e58a9f" />
        <path d="M32 42.2 L32 44 M32 44 Q30 45.8 28.8 44.6 M32 44 Q34 45.8 35.2 44.6" stroke="#8a7a74" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  penguin: {
    bg: "#dbe9f6",
    art: (
      <>
        <ellipse cx="32" cy="36" rx="18" ry="19" fill="#2c3a47" />
        <path d="M32 26 C24 22 18 28 19 36 C20 46 26 51 32 51 C38 51 44 46 45 36 C46 28 40 22 32 26 Z" fill="#fbfbfb" />
        {eyes(26, 38, 34)}
        <path d="M28.5 39 L35.5 39 L32 43.5 Z" fill="#f2a541" />
        <circle cx="22.5" cy="41" r="2.4" fill="#f7c9d4" opacity="0.7" />
        <circle cx="41.5" cy="41" r="2.4" fill="#f7c9d4" opacity="0.7" />
      </>
    ),
  },
  koala: {
    bg: "#e6ece9",
    art: (
      <>
        <circle cx="16" cy="25" r="9" fill="#8e9a9f" />
        <circle cx="48" cy="25" r="9" fill="#8e9a9f" />
        <circle cx="16" cy="25" r="5" fill="#dfe5e7" />
        <circle cx="48" cy="25" r="5" fill="#dfe5e7" />
        <circle cx="32" cy="36" r="16" fill="#a3aeb3" />
        {eyes(25.5, 38.5, 33)}
        <ellipse cx="32" cy="40" rx="4.2" ry="5.5" fill="#2e3538" />
        <ellipse cx="31" cy="38" rx="1.2" ry="1.6" fill="#5b6468" />
      </>
    ),
  },
};

export function isAvatarId(v: string): v is AvatarId {
  return (AVATAR_IDS as readonly string[]).includes(v);
}

export function ProfileAvatar({ avatar, size = 40, className, label }: { avatar: string; size?: number; className?: string; label?: string }) {
  const a = ART[isAvatarId(avatar) ? avatar : "owl"];
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="32" cy="32" r="32" fill={a.bg} />
      {a.art}
    </svg>
  );
}

/** Master persona portraits: abstract busts (not likenesses) with initials. */
const MASTER_STYLE: Record<string, { bg: string; fg: string; accent: string; initials: string; glasses?: boolean }> = {
  buffett: { bg: "#dcebe8", fg: "#1d5c5f", accent: "#f2a541", initials: "WB", glasses: true },
  lynch: { bg: "#e4e6f6", fg: "#3d4a8f", accent: "#e87ba4", initials: "PL" },
  graham: { bg: "#efe7da", fg: "#7a5534", accent: "#1baf7a", initials: "BG", glasses: true },
  munger: { bg: "#e6ece4", fg: "#3e5a3a", accent: "#2a78d6", initials: "CM", glasses: true },
  tutor: { bg: "#e0eef0", fg: "#126066", accent: "#f2a541", initials: "RT" },
};

export function MasterAvatar({ id, size = 48, className }: { id: string; size?: number; className?: string }) {
  const s = MASTER_STYLE[id] ?? { bg: "#e7e5e0", fg: "#52514e", accent: "#f2a541", initials: id.slice(0, 2).toUpperCase() };
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0 rounded-2xl", className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill={s.bg} />
      <path d="M12 64 C12 50 20 43 32 43 C44 43 52 50 52 64 Z" fill={s.fg} opacity="0.9" />
      <circle cx="32" cy="27" r="11" fill={s.fg} opacity="0.9" />
      {s.glasses && (
        <g stroke={s.bg} strokeWidth="1.6" fill="none">
          <circle cx="27.5" cy="27" r="3.4" />
          <circle cx="36.5" cy="27" r="3.4" />
          <path d="M30.9 27 L33.1 27" />
        </g>
      )}
      <rect x="38" y="44" width="22" height="14" rx="7" fill={s.accent} />
      <text x="49" y="54" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">{s.initials}</text>
    </svg>
  );
}
