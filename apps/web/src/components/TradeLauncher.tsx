import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Dialog } from "./ui/dialog";
import { SymbolSearch } from "./SymbolSearch";

/** Small dialog: pick a stock, then go to its trade ticket. */
export function TradeLauncher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Dialog open={open} onClose={onClose} title={t("home.makeTrade")} description={t("search.hint")}>
      <div className="min-h-[16rem]">
        <SymbolSearch autoFocus onSelect={(m) => { onClose(); navigate(`/trade/${encodeURIComponent(m.symbol)}`); }} />
        <div className="mt-4 flex flex-wrap gap-2">
          {["AAPL", "MSFT", "NVDA", "KO", "COST"].map((s) => (
            <button key={s} type="button" onClick={() => { onClose(); navigate(`/trade/${s}`); }}
              className="rounded-full border px-3 py-1 text-sm font-medium hover:bg-muted">
              {s}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
