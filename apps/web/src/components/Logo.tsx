import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("rounded-xl", className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="hsl(var(--primary))" />
      <path d="M14 44 L26 32 L34 38 L50 20" fill="none" stroke="hsl(var(--primary-foreground))" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="20" r="5" fill="hsl(var(--accent))" />
    </svg>
  );
}
