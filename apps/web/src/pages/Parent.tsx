import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Archive, Download, Lock, Pencil, Plus, RotateCcw, Shield, Users } from "lucide-react";
import { api } from "@/lib/api";
import { clearParentToken, getParentToken, onParentTokenChange } from "@/lib/parentAuth";
import { errorText } from "@/lib/errorText";
import { fmtMoney, fmtNumber, fmtPct, fmtRelative } from "@/lib/format";
import type { Language, ParentChildOverview, Profile } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert, Skeleton, Tabs } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState, PageHeader } from "@/components/States";
import { ProfileAvatar } from "@/components/Avatar";
import { Change } from "@/components/Change";
import { PinForm } from "@/components/PinDialog";
import { ProfileForm, defaultProfileForm, limitOf, startingCashOf, type ProfileFormValue } from "@/components/ProfileForm";

export default function Parent() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(() => getParentToken());
  const [expired, setExpired] = useState(false);
  useDocumentTitle(t("parent.title"));

  useEffect(() => onParentTokenChange((tok) => {
    setToken((prev) => {
      if (prev && !tok) setExpired(true);
      return tok;
    });
  }), []);

  // Tokens expire after 30 minutes; re-check periodically.
  useEffect(() => {
    const id = setInterval(() => { if (token && !getParentToken()) { setExpired(true); setToken(null); } }, 30_000);
    return () => clearInterval(id);
  }, [token]);

  if (!token) {
    return (
      <div className="mx-auto max-w-sm pt-6 sm:pt-12">
        <Card className="p-6">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Shield className="size-6" aria-hidden /></div>
          <h1 className="text-xl font-semibold">{t("pin.title")}</h1>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">{expired ? t("pin.expired") : t("pin.text")}</p>
          <PinForm onSuccess={() => { setExpired(false); setToken(getParentToken()); }} />
        </Card>
      </div>
    );
  }
  return <ParentDashboard />;
}

function ParentDashboard() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"overview" | "manage" | "security">("overview");
  const overview = useAsync(() => api.parentOverview(), []);
  return (
    <div>
      <PageHeader title={t("parent.title")} subtitle={t("parent.subtitle")}
        actions={<Button variant="outline" onClick={() => clearParentToken()}><Lock /> {t("parent.lock")}</Button>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" tabs={[
        { value: "overview", label: t("parent.overview") },
        { value: "manage", label: t("parent.manage") },
        { value: "security", label: t("parent.appSettings") },
      ]} />
      {tab === "overview" && (
        overview.loading && !overview.data ? <div className="grid gap-4">{[0, 1].map((i) => <Skeleton key={i} className="h-72" />)}</div>
          : overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} />
            : !overview.data?.profiles.length ? <EmptyState icon={<Users />} title={t("parent.noChildren")} action={<Button size="sm" onClick={() => setTab("manage")}><Plus /> {t("parent.createProfile")}</Button>} />
              : <div className="grid gap-5">{overview.data.profiles.map((c) => <ChildOverview key={c.profile.id} c={c} />)}</div>
      )}
      {tab === "manage" && <ManageProfiles onChanged={() => void overview.reload()} />}
      {tab === "security" && <SecuritySettings />}
    </div>
  );
}

function rate(v: number | null): string {
  return v === null ? "—" : fmtPct(v, { decimals: 0 });
}

function ChildOverview({ c }: { c: ParentChildOverview }) {
  const { t } = useTranslation();
  const s = c.stats;
  const stats: [string, string][] = [
    [t("parent.stats.researchBeforeTrade"), rate(s.research_before_trade_rate)],
    [t("parent.stats.journalRate"), rate(s.journal_completion_rate)],
    [t("parent.stats.trades"), fmtNumber(s.trades, 0)],
    [t("parent.stats.research"), fmtNumber(s.research_reports, 0)],
    [t("parent.stats.questions"), fmtNumber(s.master_questions, 0)],
    [t("parent.stats.cards"), fmtNumber(s.learning_cards_completed, 0)],
    [t("parent.stats.watchlist"), fmtNumber(s.watchlist, 0)],
    [t("parent.stats.aiToday"), `${s.ai_requests_today}${c.profile.daily_ai_limit != null ? ` / ${c.profile.daily_ai_limit}` : ""}`],
    [t("parent.stats.holdingDays"), s.average_holding_days_on_sells === null ? "—" : fmtNumber(s.average_holding_days_on_sells, 1)],
  ];
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <ProfileAvatar avatar={c.profile.avatar} size={44} />
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg">{c.profile.nickname}</CardTitle>
          <p className="text-xs text-muted-foreground">{t(`profile.age.${c.profile.age_group}`)} · {c.profile.language === "zh-CN" ? t("lang.zh") : t("lang.en")}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {c.portfolio ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label={t("snapshot.totalValue")} value={fmtMoney(c.portfolio.total_equity, { decimals: 0 })} />
            <Mini label={t("snapshot.totalPnl")} value={<Change value={c.portfolio.total_pnl} pct={c.portfolio.total_return_pct} size="xs" />} />
            <Mini label={t("snapshot.cash")} value={fmtMoney(c.portfolio.cash, { decimals: 0 })} />
            <Mini label={t("portfolio.positions")} value={fmtNumber(c.portfolio.positions, 0)} />
          </div>
        ) : <p className="text-sm text-muted-foreground">{t("parent.portfolioUnavailable")}</p>}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {stats.map(([k, v]) => (
            <div key={k} className="border-b pb-2">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 font-semibold tabular">{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="mb-2 text-sm font-medium">{t("parent.recentResearch")}</p>
          {!c.recent_research.length ? <p className="text-sm text-muted-foreground">{t("parent.noResearch")}</p> : (
            <ul className="space-y-1">
              {c.recent_research.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <Link to={`/research/${r.id}`} className="min-w-0 flex-1 truncate hover:text-primary hover:underline">{r.query}</Link>
                  {r.symbol && <Badge variant="muted">{r.symbol}</Badge>}
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtRelative(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-semibold tabular">{value}</div>
    </div>
  );
}

function toForm(p: Profile): ProfileFormValue {
  return {
    nickname: p.nickname, age_group: p.age_group, language: p.language, avatar: p.avatar,
    cashChoice: String(p.starting_cash), customCash: "", allow_etf: p.allow_etf, allow_fractional: p.allow_fractional,
    daily_ai_limit: p.daily_ai_limit != null ? String(p.daily_ai_limit) : "", daily_minutes_limit: p.daily_minutes_limit != null ? String(p.daily_minutes_limit) : "",
  };
}

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ManageProfiles({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { profiles, refreshProfiles, refreshSetup, setup, language, activeProfile, selectProfile, refreshPortfolio } = useApp();
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [form, setForm] = useState<ProfileFormValue>(defaultProfileForm(language));
  const [formErrors, setFormErrors] = useState<Partial<Record<"nickname" | "cash", string>>>({});
  const [resetting, setResetting] = useState<Profile | null>(null);
  const [archiving, setArchiving] = useState<Profile | null>(null);
  const [newCash, setNewCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void refreshProfiles(); }, [refreshProfiles]);

  const openEdit = (p: Profile | "new") => {
    setErr(null);
    setFormErrors({});
    setForm(p === "new" ? defaultProfileForm(language, setup?.default_starting_cash ?? 1_000_000) : toForm(p));
    setEditing(p);
  };

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof formErrors = {};
    if (!form.nickname.trim()) errs.nickname = t("onboarding.nicknameRequired");
    const cash = startingCashOf(form);
    if (editing === "new" && cash === null) errs.cash = t("onboarding.customCashInvalid");
    setFormErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setErr(null);
    const ai = limitOf(form.daily_ai_limit);
    const mins = limitOf(form.daily_minutes_limit);
    try {
      if (editing === "new") {
        await api.createProfile({
          nickname: form.nickname.trim(), age_group: form.age_group, language: form.language, avatar: form.avatar, starting_cash: cash ?? 1_000_000,
          allow_etf: form.allow_etf, allow_fractional: form.allow_fractional, daily_ai_limit: ai, daily_minutes_limit: mins,
        });
        toast.push("success", t("parent.profileCreated"));
        void refreshSetup();
      } else if (editing) {
        await api.patchProfile(editing.id, {
          nickname: form.nickname.trim(), age_group: form.age_group, language: form.language, avatar: form.avatar,
          allow_etf: form.allow_etf, allow_fractional: form.allow_fractional,
          ...(ai === null ? { clear_ai_limit: true } : { daily_ai_limit: ai }),
          ...(mins === null ? { clear_minutes_limit: true } : { daily_minutes_limit: mins }),
        }, true);
        toast.push("success", t("parent.profileSaved"));
      }
      await refreshProfiles();
      onChanged();
      setEditing(null);
    } catch (e2) {
      setErr(errorText(t, e2));
    } finally {
      setBusy(false);
    }
  };

  const doExport = async (p: Profile) => {
    try {
      const data = await api.exportHistory(p.id);
      download(`junior-investor-${p.nickname}-${new Date().toISOString().slice(0, 10)}.json`, data);
      toast.push("success", t("parent.exported"));
    } catch (e) {
      toast.push("error", errorText(t, e));
    }
  };

  const doReset = async () => {
    if (!resetting) return;
    const cashRaw = newCash.replace(/[,\s]/g, "");
    const cash = cashRaw ? Number(cashRaw) : null;
    if (cash !== null && !(cash > 0 && cash <= 1_000_000_000)) { setErr(t("onboarding.customCashInvalid")); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.resetPortfolio(resetting.id, cash);
      toast.push("success", t("parent.resetDone"));
      await refreshProfiles();
      if (activeProfile?.id === resetting.id) void refreshPortfolio();
      onChanged();
      setResetting(null);
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const doArchive = async () => {
    if (!archiving) return;
    setBusy(true);
    setErr(null);
    try {
      await api.archiveProfile(archiving.id);
      if (activeProfile?.id === archiving.id) selectProfile(null);
      toast.push("success", t("parent.profileArchived"));
      await Promise.all([refreshProfiles(), refreshSetup()]);
      onChanged();
      setArchiving(null);
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => openEdit("new")}><Plus /> {t("parent.createProfile")}</Button></div>
      {!profiles.length ? <EmptyState icon={<Users />} title={t("parent.noChildren")} /> : (
        <ul className="grid gap-3">
          {profiles.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ProfileAvatar avatar={p.avatar} size={44} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.nickname}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`profile.age.${p.age_group}`)} · {p.language === "zh-CN" ? t("lang.zh") : t("lang.en")} · {t("portfolio.startingCash")} {fmtMoney(p.starting_cash, { decimals: 0 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("parent.aiLimit")}: {p.daily_ai_limit ?? t("parent.noLimit")} · {t("parent.allowEtf")}: {p.allow_etf ? t("common.yes") : t("common.no")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(p)}><Pencil /> {t("common.edit")}</Button>
                  <Button variant="outline" size="sm" onClick={() => { setErr(null); setNewCash(""); setResetting(p); }}><RotateCcw /> {t("parent.resetPortfolio")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setErr(null); setArchiving(p); }}><Archive /> {t("parent.archive")}</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} size="lg"
        title={editing === "new" ? t("parent.createProfile") : t("parent.editProfile")}
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
          <Button type="submit" form="profile-form" loading={busy}>{t("common.save")}</Button>
        </>}>
        <form id="profile-form" onSubmit={saveProfile} className="space-y-4" noValidate>
          <ProfileForm value={form} onChange={setForm} mode={editing === "new" ? "create" : "edit"} errors={formErrors} fractionalServerEnabled={!!setup?.fractional_enabled} />
          {err && <Alert variant="danger">{err}</Alert>}
        </form>
      </Dialog>

      <Dialog open={!!resetting} onClose={() => setResetting(null)} title={resetting ? t("parent.resetTitle", { name: resetting.nickname }) : ""}
        footer={<>
          <Button variant="ghost" onClick={() => setResetting(null)}>{t("common.cancel")}</Button>
          <Button variant="destructive" onClick={() => void doReset()} loading={busy}>{t("parent.resetConfirm")}</Button>
        </>}>
        {resetting && (
          <div className="space-y-4">
            <Alert variant="warning">{t("parent.resetWarning")}</Alert>
            <Button variant="outline" onClick={() => void doExport(resetting)}><Download /> {t("parent.exportFirst")}</Button>
            <Field label={t("parent.newStartingCash")} htmlFor="reset-cash" hint={t("parent.keepCash", { cash: fmtMoney(resetting.starting_cash, { decimals: 0 }) })}>
              <Input id="reset-cash" inputMode="decimal" value={newCash} onChange={(e) => setNewCash(e.target.value.replace(/[^\d.,]/g, ""))} />
            </Field>
            {err && <Alert variant="danger">{err}</Alert>}
          </div>
        )}
      </Dialog>

      <Dialog open={!!archiving} onClose={() => setArchiving(null)} size="sm" title={archiving ? t("parent.archiveTitle", { name: archiving.nickname }) : ""}
        description={t("parent.archiveText")}
        footer={<>
          <Button variant="ghost" onClick={() => setArchiving(null)}>{t("common.cancel")}</Button>
          <Button variant="destructive" onClick={() => void doArchive()} loading={busy}>{t("parent.archive")}</Button>
        </>}>
        {err && <Alert variant="danger">{err}</Alert>}
      </Dialog>
    </div>
  );
}

function SecuritySettings() {
  const { t } = useTranslation();
  const toast = useToast();
  const { refreshSetup } = useApp();
  const settings = useAsync(() => api.settings(), []);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [lang, setLang] = useState<Language>("en-US");
  const [family, setFamily] = useState("");
  const [setBusy, setSetBusy] = useState(false);

  useEffect(() => {
    if (settings.data) { setLang(settings.data.default_language); setFamily(settings.data.family_name ?? ""); }
  }, [settings.data]);

  const changePin = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,12}$/.test(newPin)) { setPinErr(t("onboarding.pinInvalid")); return; }
    if (newPin !== newPin2) { setPinErr(t("onboarding.pinMismatch")); return; }
    setPinBusy(true);
    setPinErr(null);
    try {
      await api.changePin(oldPin, newPin);
      toast.push("success", t("parent.pinChanged"));
      setOldPin(""); setNewPin(""); setNewPin2("");
    } catch (e2) {
      // A wrong old PIN returns 401 INVALID_PIN — that must not log the parent out.
      setPinErr(errorText(t, e2));
    } finally {
      setPinBusy(false);
    }
  };

  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSetBusy(true);
    try {
      await api.patchSettings({ default_language: lang, family_name: family.trim() || undefined });
      await refreshSetup();
      toast.push("success", t("parent.settingsSaved"));
    } catch (e2) {
      toast.push("error", errorText(t, e2));
    } finally {
      setSetBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{t("parent.changePin")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={changePin} className="space-y-4" noValidate>
            <Field label={t("parent.oldPin")} htmlFor="old-pin">
              <Input id="old-pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={12} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label={t("parent.newPin")} htmlFor="new-pin" hint={t("onboarding.pinHint")}>
              <Input id="new-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={12} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label={t("parent.confirmPin")} htmlFor="new-pin2" error={pinErr}>
              <Input id="new-pin2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={12} value={newPin2} onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, ""))} aria-invalid={!!pinErr} />
            </Field>
            <Button type="submit" loading={pinBusy} disabled={!oldPin || !newPin}>{t("parent.changePin")}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("parent.appSettings")}</CardTitle></CardHeader>
        <CardContent>
          {settings.loading ? <Skeleton className="h-32" /> : settings.error ? <ErrorState error={settings.error} onRetry={settings.reload} compact /> : (
            <form onSubmit={saveSettings} className="space-y-4">
              <Field label={t("parent.defaultLanguage")} htmlFor="def-lang">
                <Select id="def-lang" value={lang} onChange={(e) => setLang(e.target.value === "zh-CN" ? "zh-CN" : "en-US")}>
                  <option value="zh-CN">{t("lang.zh")}</option>
                  <option value="en-US">{t("lang.en")}</option>
                </Select>
              </Field>
              <Field label={t("parent.familyName")} htmlFor="fam-name">
                <Input id="fam-name" maxLength={80} value={family} onChange={(e) => setFamily(e.target.value)} />
              </Field>
              <Button type="submit" loading={setBusy}>{t("common.save")}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
