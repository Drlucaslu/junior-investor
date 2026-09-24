import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { fmtMoney, fmtMoneyCompact, fmtPct, signOf } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Gain/loss display. Direction is shown with an arrow as well as colour (colour follows the user's convention). */
export function Change({ value, pct, compact, className, showIcon = true, size = "sm" }: {
  value?: number | null; pct?: number | null; compact?: boolean; className?: string; showIcon?: boolean; size?: "xs" | "sm" | "md";
}) {
  const s = signOf(value ?? pct);
  const Icon = s === "up" ? ArrowUpRight : s === "down" ? ArrowDownRight : Minus;
  const hasValue = typeof value === "number";
  const hasPct = typeof pct === "number";
  if (!hasValue && !hasPct) return <span className={cn("text-muted-foreground", className)}>—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular",
        s === "up" && "text-gain",
        s === "down" && "text-loss",
        s === "flat" && "text-muted-foreground",
        size === "xs" && "text-xs",
        size === "sm" && "text-sm",
        size === "md" && "text-base",
        className,
      )}
    >
      {showIcon && <Icon className={size === "md" ? "size-4" : "size-3.5"} aria-hidden />}
      {hasValue && <span>{compact ? fmtMoneyCompact(value, { sign: true }) : fmtMoney(value, { sign: true })}</span>}
      {hasValue && hasPct && <span className="opacity-80">({fmtPct(pct, { sign: true })})</span>}
      {!hasValue && hasPct && <span>{fmtPct(pct, { sign: true })}</span>}
    </span>
  );
}
