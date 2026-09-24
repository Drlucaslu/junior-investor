import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Candle, FinancialPeriod, HistoryRange } from "@/lib/types";
import { fmtMoney, fmtMoneyCompact, fmtRatioPct } from "@/lib/format";
import { parseDate } from "@/lib/utils";
import i18n from "@/i18n";

const VARS = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-6", "--series-7", "--series-8",
  "--series-other", "--chart-grid", "--chart-line", "--gain", "--loss", "--muted-foreground", "--card", "--border", "--foreground"] as const;
type ChartColors = Record<(typeof VARS)[number], string>;

function readColors(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as ChartColors;
  for (const v of VARS) {
    const raw = cs.getPropertyValue(v).trim();
    out[v] = raw.startsWith("#") || raw.startsWith("rgb") ? raw : raw ? `hsl(${raw})` : "#888";
  }
  return out;
}

/** Resolves the theme's CSS variables to concrete colours for SVG (recomputed on theme / convention change). */
export function useChartColors(): ChartColors {
  const [c, setC] = useState<ChartColors>(() => readColors());
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setC(readColors());
    mq.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-convention"] });
    return () => { mq.removeEventListener("change", update); mo.disconnect(); };
  }, []);
  return c;
}

export const SERIES = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-6", "--series-7", "--series-8"] as const;

const tooltipStyle = (c: ChartColors) => ({
  contentStyle: { background: c["--card"], border: `1px solid ${c["--border"]}`, borderRadius: 10, fontSize: 12, color: c["--foreground"] },
  labelStyle: { color: c["--muted-foreground"], marginBottom: 4 },
  itemStyle: { color: c["--foreground"], padding: 0 },
});

// ------------------------------------------------------------------ price history

export function PriceChart({ candles, range, height = 260 }: { candles: Candle[]; range: HistoryRange; height?: number }) {
  const c = useChartColors();
  const data = useMemo(() => candles.map((k) => ({ t: parseDate(k.t)?.getTime() ?? 0, c: k.c })), [candles]);
  if (!data.length) return null;
  const first = data[0].c;
  const last = data[data.length - 1].c;
  const color = last >= first ? c["--gain"] : c["--loss"];
  const intraday = range === "1D" || range === "1W";
  const tickOpts: Intl.DateTimeFormatOptions = range === "1D" ? { hour: "2-digit", minute: "2-digit" }
    : range === "1W" ? { weekday: "short", day: "numeric" }
      : range === "5Y" ? { year: "numeric", month: "short" }
        : range === "1Y" ? { year: "2-digit", month: "short" } : { month: "short", day: "numeric" };
  const fmtTick = (v: number) => new Intl.DateTimeFormat(i18n.language, tickOpts).format(new Date(v));
  const t0 = data[0].t;
  const t1 = data[data.length - 1].t;
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(t0 + ((t1 - t0) * i) / 4));
  const min = Math.min(...data.map((d) => d.c));
  const max = Math.max(...data.map((d) => d.c));
  const pad = (max - min) * 0.08 || max * 0.02;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" ticks={ticks} tickFormatter={fmtTick} tick={{ fontSize: 11, fill: c["--muted-foreground"] }}
            axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis domain={[min - pad, max + pad]} tickFormatter={(v: number) => fmtMoney(v, { decimals: v >= 1000 ? 0 : 2 })} tick={{ fontSize: 11, fill: c["--muted-foreground"] }}
            axisLine={false} tickLine={false} width={64} orientation="right" />
          <Tooltip
            {...tooltipStyle(c)}
            labelFormatter={(v) => new Intl.DateTimeFormat(i18n.language, intraday ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "short", day: "numeric" }).format(new Date(Number(v)))}
            formatter={(v) => [fmtMoney(Number(v)), ""]}
            separator=""
            cursor={{ stroke: c["--muted-foreground"], strokeDasharray: "3 3" }}
          />
          <Area type="monotone" dataKey="c" stroke={color} strokeWidth={2} fill="url(#priceFill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------------ financials

function yearLabel(p: FinancialPeriod): string {
  return p.fiscal_year ? String(p.fiscal_year) : p.period_end.slice(0, 4);
}

export function FinancialBarChart({ periods, height = 220 }: { periods: FinancialPeriod[]; height?: number }) {
  const { t } = useTranslation();
  const c = useChartColors();
  const data = periods.map((p) => ({ year: yearLabel(p), revenue: p.revenue, net_income: p.net_income, fcf: p.free_cash_flow }));
  const series = [
    { key: "revenue", name: t("terms.revenue"), color: c["--series-1"] },
    { key: "net_income", name: t("terms.net_income"), color: c["--series-2"] },
    { key: "fcf", name: t("terms.fcf"), color: c["--series-3"] },
  ];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: c["--muted-foreground"] }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => (v === 0 ? "0" : fmtMoneyCompact(v))} tick={{ fontSize: 11, fill: c["--muted-foreground"] }} axisLine={false} tickLine={false} width={72} />
          <Tooltip {...tooltipStyle(c)} formatter={(v, name) => [fmtMoneyCompact(Number(v)), String(name)]} cursor={{ fill: c["--chart-grid"], opacity: 0.5 }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} itemSorter={null} formatter={(v) => <span style={{ color: c["--muted-foreground"] }}>{String(v)}</span>} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MarginsChart({ periods, height = 220 }: { periods: FinancialPeriod[]; height?: number }) {
  const { t } = useTranslation();
  const c = useChartColors();
  const data = periods.map((p) => ({ year: yearLabel(p), gross: p.gross_margin, operating: p.operating_margin, net: p.net_margin }));
  const series = [
    { key: "gross", name: t("terms.gross_margin"), color: c["--series-1"] },
    { key: "operating", name: t("terms.operating_margin"), color: c["--series-2"] },
    { key: "net", name: t("terms.net_margin"), color: c["--series-3"] },
  ];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: c["--muted-foreground"] }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => fmtRatioPct(v, 0)} tick={{ fontSize: 11, fill: c["--muted-foreground"] }} axisLine={false} tickLine={false} width={44} domain={[0, "auto"]} />
          <Tooltip {...tooltipStyle(c)} formatter={(v, name) => [fmtRatioPct(Number(v)), String(name)]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} itemSorter={null} formatter={(v) => <span style={{ color: c["--muted-foreground"] }}>{String(v)}</span>} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: c["--card"] }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------------ allocation donut

export interface Slice { name: string; value: number; colorVar?: string }

export function AllocationDonut({ slices, total, height = 220 }: { slices: Slice[]; total: number; height?: number }) {
  const c = useChartColors();
  const colored = slices.map((s, i) => ({ ...s, color: c[(s.colorVar ?? SERIES[i % SERIES.length]) as keyof ChartColors] }));
  return (
    <div style={{ height }} className="relative w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={colored} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke={c["--card"]} strokeWidth={2} isAnimationActive={false}>
            {colored.map((s) => <Cell key={s.name} fill={s.color} />)}
          </Pie>
          <Tooltip {...tooltipStyle(c)} formatter={(v, name) => [`${fmtMoney(Number(v), { decimals: 0 })} · ${fmtRatioPct(total ? Number(v) / total : 0)}`, String(name)]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
