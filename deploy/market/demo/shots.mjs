import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";
const B = "http://127.0.0.1:8100", A = B + "/api/v1";
const OUT = "/home/claude/junior-investor/deploy/market/assets";
const PID = "e9a10a325ef94f2b9f879fd68c47f870";
const REPORT = "283e67d824b14283a25534a7156c3717";
const SESSION = "2d8a19cfcf1a48a6bf32f410fc83f7f8";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const post = (u, b) => fetch(A + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b ?? {}) }).then(j);

// Give the demo learner some learning-path progress (all through the public API).
const cards = await fetch(A + "/learn/cards").then(j);
const quiz = Object.fromEntries(cards.map((c) => [c.id, c.quiz]));
for (const id of ["compounding", "cd_savings", "risk_return", "inflation", "bonds_basics", "rates_bonds", "diversification", "etf", "what_is_stock"])
  await post(`/profiles/${PID}/learn/${id}/complete`, quiz[id] ? { answer: quiz[id].answer } : {});
async function play(sid, steps) {
  const s = await post(`/profiles/${PID}/scenarios/${sid}/start`);
  let out = s;
  for (const [alloc, reason] of steps) out = await post(`/scenario-runs/${s.run.id}/decide`, { allocations: alloc, reason });
  return out;
}
await play("rate_shock_2022", [[{ A: 40, B: 30, C: 30 }, "Bonds are safe and tech has been strong, so I split between them."],
  [{ A: 50, C: 30, D: 20 }, "Long bonds fell a lot. Moving to short bonds and some energy."],
  [{ A: 30, C: 50, D: 20 }, "Rates may stop rising, so I added back to the tech fund."]]);
const phone = await play("smartphone_2007", [[{ A: 30, B: 30, C: 20, D: 20 }, "A and B lead the market today, but C's touchscreen could be big."],
  [{ A: 20, B: 20, C: 40, D: 20 }, "People love the new phone and the app store. Adding to C."],
  [{ B: 10, C: 60, D: 30 }, "A is losing customers fast. C keeps growing, D is still very profitable."]]);
await play("dotcom_2000", [[{ A: 30, B: 25, C: 15, D: 30 }, "The internet is the future, but I keep D in case the hype fades."]]);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
await ctx.addInitScript(([pid]) => {
  localStorage.setItem("ji.activeProfile", pid); localStorage.setItem("ji.language", "en-US");
  localStorage.setItem(`ji.welcomed.${pid}`, "1"); localStorage.setItem(`ji.account.${pid}`, "family");
}, [PID]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
async function shot(path, name, prep) {
  await page.goto(B + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  if (prep) await prep();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/raw-${name}.png` });
  console.log("shot", name);
}
const scrollTo = async (text, off = 110) => {
  await page.getByText(text).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate((o) => window.scrollBy(0, -o), off);
};
await shot("/home", "1-home");
await shot("/path", "2-path");
await shot("/scenarios/dotcom_2000", "3-scenario", () => scrollTo("What happened", 215));
await shot(`/scenarios/smartphone_2007?run=${phone.run.id}`, "4-reveal", () => scrollTo("The big reveal", 40));
await shot(`/masters/buffett?session=${SESSION}`, "5-master", async () => { await page.evaluate(() => window.scrollTo(0, 0)); });
await shot(`/research/${REPORT}`, "6-research", () => scrollTo("Financial snapshot"));
await shot("/learn?card=rates_bonds", "7-lesson", async () => {
  await page.locator('[role="dialog"]').evaluate((el) => { const s = el.querySelector(".overflow-y-auto") || el; s.scrollTop = 400; });
});
await shot("/portfolio", "8-portfolio");
await browser.close();
