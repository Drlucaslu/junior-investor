/** Parent-only card: choose the AI model — the local Olares model or a cloud
 *  provider (any OpenAI-compatible endpoint). API keys stay on the server. */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Cloud, Cpu, KeyRound, ListRestart, Lock, PlugZap, RotateCcw, Save, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { getParentToken, onParentTokenChange } from "@/lib/parentAuth";
import { errorText } from "@/lib/errorText";
import type { AIConfig, AIConfigInput, AIPreset } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/input";
import { Alert, Skeleton, Switch } from "./ui/misc";
import { PinDialog } from "./PinDialog";

type TestResult = { ok: boolean; text: string } | null;

export function AISettingsCard({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(() => getParentToken());
  const [pinOpen, setPinOpen] = useState(false);
  const [presets, setPresets] = useState<AIPreset[]>([]);
  const [saved, setSaved] = useState<AIConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [preset, setPreset] = useState("olares");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [nativeTools, setNativeTools] = useState(true);

  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "models" | "test" | "save" | "reset">("");
  const [test, setTest] = useState<TestResult>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => onParentTokenChange(setToken), []);

  const apply = (c: AIConfig) => {
    setSaved(c);
    setPreset(c.preset);
    setBaseUrl(c.base_url);
    setModel(c.model);
    setTemperature(c.temperature);
    setNativeTools(c.native_tools);
    setApiKey("");
  };

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    setLoadErr(null);
    api.aiSettings()
      .then((r) => { if (alive) { setPresets(r.presets); apply(r.config); } })
      .catch((e: unknown) => alive && setLoadErr(errorText(t, e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token, t]);

  const current = useMemo(() => presets.find((p) => p.id === preset), [presets, preset]);
  const isCloud = current?.cloud ?? true;
  const keyKept = !!saved?.has_api_key && saved.base_url.replace(/\/$/, "") === baseUrl.replace(/\/$/, "");

  const body = (): AIConfigInput => ({ preset, base_url: baseUrl.trim(), model: model.trim(), api_key: apiKey.trim() || null, temperature, native_tools: nativeTools });

  const pickPreset = (id: string) => {
    setPreset(id);
    setModels([]);
    setTest(null);
    setMsg(null);
    const p = presets.find((x) => x.id === id);
    if (p?.base_url) setBaseUrl(p.base_url);
    else if (id === "olares" && saved?.preset === "olares") setBaseUrl(saved.base_url);
    else if (!p?.base_url) setBaseUrl("");
    if (saved?.preset !== id) setModel("");
  };

  const urlValid = /^https?:\/\/\S+$/.test(baseUrl.trim());

  const fetchModels = async () => {
    setBusy("models"); setMsg(null);
    try {
      const r = await api.listAiModels(body());
      if (r.ok) { setModels(r.models); if (!r.models.length) setMsg({ ok: false, text: t("ai.noModels") }); }
      else setMsg({ ok: false, text: t("ai.modelsFailed", { error: r.error ?? "" }) });
    } catch (e) { setMsg({ ok: false, text: errorText(t, e) }); } finally { setBusy(""); }
  };

  const runTest = async () => {
    setBusy("test"); setTest(null); setMsg(null);
    try {
      const r = await api.testAiSettings(body());
      setTest(r.ok ? { ok: true, text: t("ai.testOk", { ms: r.latency_ms, reply: (r.reply ?? "").slice(0, 60) }) }
        : { ok: false, text: t("ai.testFail", { error: r.error ?? "" }) });
    } catch (e) { setTest({ ok: false, text: errorText(t, e) }); } finally { setBusy(""); }
  };

  const save = async () => {
    setBusy("save"); setMsg(null);
    try {
      const r = await api.saveAiSettings(body());
      apply(r.config);
      setMsg({ ok: true, text: t("ai.saved") });
      onSaved?.();
    } catch (e) { setMsg({ ok: false, text: errorText(t, e) }); } finally { setBusy(""); }
  };

  const reset = async () => {
    setBusy("reset"); setMsg(null);
    try {
      const r = await api.resetAiSettings();
      apply(r.config);
      setModels([]);
      setMsg({ ok: true, text: t("ai.resetDone") });
      onSaved?.();
    } catch (e) { setMsg({ ok: false, text: errorText(t, e) }); } finally { setBusy(""); }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Cpu className="size-4 text-primary" aria-hidden />{t("ai.title")}</CardTitle>
        <CardDescription>{t("ai.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {!token ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{t("ai.parentOnly")}</p>
            <Button variant="outline" onClick={() => setPinOpen(true)}><Lock /> {t("ai.unlock")}</Button>
          </div>
        ) : loading ? <Skeleton className="h-64" /> : loadErr ? <Alert variant="danger">{loadErr}</Alert> : (
          <div className="space-y-5">
            {saved && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("ai.current")}</span>
                <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{t(`ai.presets.${saved.preset}`, { defaultValue: saved.preset })}</span>
                <span className="font-mono text-xs">{saved.model || "—"}</span>
                {!saved.configured && <span className="text-danger">{t("ai.notConfigured")}</span>}
                {saved.source === "env" && saved.configured && <span className="text-xs text-muted-foreground">{t("ai.fromEnv")}</span>}
              </p>
            )}

            <div role="radiogroup" aria-label={t("ai.provider")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {presets.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} onClick={() => pickPreset(p.id)}
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-colors ${preset === p.id ? "border-primary bg-primary-soft" : "border-border hover:bg-muted"}`}>
                  {p.cloud ? <Cloud className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <Cpu className="size-4 shrink-0 text-primary" aria-hidden />}
                  <span className="font-medium leading-tight">{t(`ai.presets.${p.id}`, { defaultValue: p.id })}</span>
                </button>
              ))}
            </div>

            {isCloud && <Alert variant="warning" title={t("ai.cloudPrivacyTitle")}>{t("ai.cloudPrivacy")}</Alert>}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("ai.baseUrl")} htmlFor="ai-url" hint={preset === "olares" ? t("ai.baseUrlHintLocal") : t("ai.baseUrlHint")}
                error={baseUrl && !urlValid ? t("ai.urlInvalid") : null}>
                <Input id="ai-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" autoComplete="off" spellCheck={false} inputMode="url" />
              </Field>
              <Field label={<span className="inline-flex items-center gap-1.5"><KeyRound className="size-3.5" aria-hidden />{t("ai.apiKey")}</span>} htmlFor="ai-key"
                hint={keyKept ? t("ai.keyKept", { hint: saved?.api_key_hint }) : current?.needs_key ? t("ai.keyRequired") : t("ai.keyOptional")}>
                <Input id="ai-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password"
                  placeholder={keyKept ? saved?.api_key_hint : "sk-…"} spellCheck={false} />
              </Field>
              <Field label={t("ai.model")} htmlFor="ai-model" hint={t("ai.modelHint")}>
                <div className="flex gap-2">
                  {models.length > 0 ? (
                    <Select id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} className="flex-1">
                      <option value="">{t("ai.chooseModel")}</option>
                      {model && !models.includes(model) && <option value={model}>{model}</option>}
                      {models.map((m) => <option key={m} value={m}>{m}</option>)}
                    </Select>
                  ) : (
                    <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("ai.modelPlaceholder")} className="flex-1" spellCheck={false} />
                  )}
                  <Button variant="outline" onClick={() => void fetchModels()} loading={busy === "models"} disabled={!urlValid || !!busy} aria-label={t("ai.fetchModels")}>
                    {busy !== "models" && <ListRestart />}<span className="hidden sm:inline">{t("ai.fetchModels")}</span>
                  </Button>
                </div>
              </Field>
              <div className="space-y-4">
                <Field label={t("ai.temperature", { v: temperature.toFixed(1) })} htmlFor="ai-temp" hint={t("ai.temperatureHint")}>
                  <input id="ai-temp" type="range" min={0} max={1} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
                </Field>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="ai-tools" className="text-sm"><span className="font-medium">{t("ai.nativeTools")}</span><span className="block text-xs text-muted-foreground">{t("ai.nativeToolsHint")}</span></label>
                  <Switch id="ai-tools" checked={nativeTools} onChange={setNativeTools} label={t("ai.nativeTools")} />
                </div>
              </div>
            </div>

            {test && (
              <Alert variant={test.ok ? "success" : "danger"} icon={test.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}>{test.text}</Alert>
            )}
            {msg && <Alert variant={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void runTest()} loading={busy === "test"} disabled={!urlValid || !model.trim() || !!busy}>
                {busy !== "test" && <PlugZap />} {t("ai.test")}
              </Button>
              <Button onClick={() => void save()} loading={busy === "save"} disabled={!urlValid || !model.trim() || !!busy}>
                {busy !== "save" && <Save />} {t("ai.save")}
              </Button>
              {saved?.source === "settings" && (
                <Button variant="ghost" onClick={() => void reset()} loading={busy === "reset"} disabled={!!busy}>
                  {busy !== "reset" && <RotateCcw />} {t("ai.reset")}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
      <PinDialog open={pinOpen} onClose={() => setPinOpen(false)} onSuccess={() => { setPinOpen(false); setToken(getParentToken()); }} message={t("ai.pinMessage")} />
    </Card>
  );
}
