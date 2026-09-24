import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary",
        muted: "bg-muted text-muted-foreground",
        outline: "border text-muted-foreground",
        accent: "bg-accent-soft text-accent-foreground dark:text-accent",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        success: "bg-success-soft text-success",
        gain: "bg-gain-soft text-gain",
        loss: "bg-loss-soft text-loss",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...p }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...p} />;
}
