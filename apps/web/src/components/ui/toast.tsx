import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, Sparkles, X, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info" | "achievement";
interface Toast { id: number; kind: ToastKind; message: ReactNode }
interface ToastApi { push: (kind: ToastKind, message: ReactNode) => void }

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t: tr } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: ToastKind, message: ReactNode) => {
    const id = ++idRef.current;
    setToasts((ts) => [...ts.slice(-2), { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === "achievement" ? 5000 : 3800);
  }, [dismiss]);
  const api = useMemo(() => ({ push }), [push]);
  const icon: Record<ToastKind, ReactNode> = {
    success: <CheckCircle2 className="size-5 text-success" aria-hidden />,
    error: <XCircle className="size-5 text-danger" aria-hidden />,
    info: <Info className="size-5 text-primary" aria-hidden />,
    achievement: <Sparkles className="size-5 text-accent" aria-hidden />,
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-pop animate-fade-in",
              t.kind === "achievement" && "border-accent/40",
            )}>
              {icon[t.kind]}
              <div className="min-w-0 flex-1 pt-0.5">{t.message}</div>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => dismiss(t.id)} aria-label={tr("common.close")}>
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
}
