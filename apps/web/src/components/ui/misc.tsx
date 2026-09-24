import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden {...p} />;
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

type AlertVariant = "info" | "warning" | "danger" | "success";
const alertStyles: Record<AlertVariant, string> = {
  info: "bg-primary-soft text-foreground border-primary/20",
  warning: "bg-warning-soft text-foreground border-warning/30",
  danger: "bg-danger-soft text-foreground border-danger/30",
  success: "bg-success-soft text-foreground border-success/30",
};
const alertIcon: Record<AlertVariant, ReactNode> = {
  info: <Info className="size-4 text-primary" aria-hidden />,
  warning: <AlertTriangle className="size-4 text-warning" aria-hidden />,
  danger: <XCircle className="size-4 text-danger" aria-hidden />,
  success: <CheckCircle2 className="size-4 text-success" aria-hidden />,
};

export function Alert({ variant = "info", title, children, className, action, icon }: {
  variant?: AlertVariant; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div role={variant === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border px-3.5 py-3 text-sm", alertStyles[variant], className)}>
      <div className="mt-0.5 shrink-0">{icon ?? alertIcon[variant]}</div>
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn("text-foreground/85", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, id, disabled, label }: {
  checked: boolean; onChange: (v: boolean) => void; id?: string; disabled?: boolean; label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = "md", label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; className?: string }[]; className?: string;
  size?: "sm" | "md"; label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg bg-muted p-1 gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-md font-medium transition-colors whitespace-nowrap",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            value === o.value && o.className,
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: {
  value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[]; className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-1 border-b overflow-x-auto", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            value === t.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}
