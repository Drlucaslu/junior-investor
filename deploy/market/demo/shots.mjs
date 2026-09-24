import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";
const B = "http://127.0.0.1:8100";
const OUT = "/home/claude/junior-investor/deploy/market/assets";
const PID = "e9a10a325ef94f2b9f879fd68c47f870";
const REPORT = "283e67d824b14283a25534a7156c3717";
const SESSION = "2d8a19cfcf1a48a6bf32f410fc83f7f8";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
await ctx.addInitScript(([pid]) => {
  localStorage.setItem("ji.activeProfile", pid);
  localStorage.setItem("ji.language", "en-US");
  localStorage.setItem(`ji.welcomed.${pid}`, "1");
}, [PID]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

async function shot(path, name, prep) {
  await page.goto(B + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  if (prep) await prep();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/raw-${name}.png` });
  console.log("shot", name);
}

await shot("/home", "1-home");
await shot(`/research/${REPORT}`, "2-research", async () => {
  await page.getByText("Financial snapshot").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -110));
});
await shot(`/research/${REPORT}`, "3-research-report", async () => {
  await page.getByText("2. Business Model").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -110));
});
await shot(`/masters/buffett?session=${SESSION}`, "4-master", async () => { await page.evaluate(() => window.scrollTo(0, 0)); });
await shot("/portfolio", "5-portfolio");
await shot("/settings", "6-settings", async () => {
  await page.getByRole("button", { name: "Parent unlock" }).click();
  await page.locator("#parent-pin").fill("2468");
  await page.locator("form button[type=submit]").click();
  await page.waitForTimeout(1200);
  await page.getByRole("radio", { name: /OpenAI/ }).first().click();
  const t = page.getByText("AI model").first();
  await t.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -100));
});
await browser.close();
