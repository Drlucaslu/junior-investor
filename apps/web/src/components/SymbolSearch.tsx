import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import type { SymbolMatch } from "@/lib/types";
import { useDebounced } from "@/hooks/useAsync";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

/** Debounced stock search combobox backed by GET /market/search. */
export function SymbolSearch({ onSelect, placeholder, className, autoFocus, inputClassName, clearOnSelect = true, label }: {
  onSelect: (m: SymbolMatch) => void; placeholder?: string; className?: string; autoFocus?: boolean; inputClassName?: string;
  clearOnSelect?: boolean; label?: string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SymbolMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const dq = useDebounced(q.trim(), 250);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dq) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    api.search(dq, ctrl.signal)
      .then((r) => { setResults(r); setActive(0); })
      .catch(() => { if (!ctrl.signal.aborted) setResults([]); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [dq]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const choose = (m: SymbolMatch) => {
    onSelect(m);
    setOpen(false);
    if (clearOnSelect) setQ("");
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) choose(results[active]);
      else if (/^[A-Za-z.\-]{1,6}$/.test(q.trim())) choose({ symbol: q.trim().toUpperCase(), name: q.trim().toUpperCase(), exchange: null, type: null });
    }
  };

  const showList = open && q.trim().length > 0;
  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={label ?? t("topbar.searchLabel")}
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder ?? t("topbar.searchPlaceholder")}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          inputClassName,
        )}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-xl border bg-card p-1 shadow-pop">
          {loading && results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t("search.searching")}</li>}
          {!loading && results.length === 0 && dq && <li className="px-3 py-2 text-sm text-muted-foreground">{t("search.noMatches")}</li>}
          {results.map((r, i) => (
            <li
              key={r.symbol}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(r); }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm", i === active && "bg-muted")}
            >
              <span className="w-14 shrink-0 font-semibold">{r.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.name}</span>
              {r.type === "ETF" && <Badge variant="muted">ETF</Badge>}
              {r.exchange && <span className="hidden text-xs text-muted-foreground sm:inline">{r.exchange}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
