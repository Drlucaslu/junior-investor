import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";
import fs from "fs";
const home = fs.readFileSync("/tmp/home.b64", "utf8"), icon = fs.readFileSync("/tmp/icon.b64", "utf8");
const html = `<html><body style="margin:0;width:1440px;height:900px;overflow:hidden;font-family:Inter,'Segoe UI',system-ui,sans-serif;
background:radial-gradient(1200px 700px at 85% 110%,#f4a25933,transparent 60%),linear-gradient(135deg,#0b4a50 0%,#136e74 55%,#1b8a8f 100%);color:#fff">
<div style="position:absolute;left:96px;top:150px;width:560px">
 <img src="data:image/png;base64,${icon}" style="width:112px;height:112px;border-radius:26px;box-shadow:0 18px 40px #00000040">
 <div style="margin-top:36px;font-size:64px;font-weight:800;letter-spacing:-1.5px;line-height:1.05">Junior Investor</div>
 <div style="margin-top:10px;font-size:34px;font-weight:600;opacity:.92">少年投资家</div>
 <div style="margin-top:28px;font-size:25px;line-height:1.5;opacity:.9">Kids learn how good investors think — AI masters, source-cited research and a virtual-money portfolio.</div>
 <div style="margin-top:34px;display:flex;gap:12px;flex-wrap:wrap;font-size:18px;font-weight:600">
  <span style="background:#ffffff22;border:1px solid #ffffff44;border-radius:999px;padding:9px 18px">Ages 10–18</span>
  <span style="background:#ffffff22;border:1px solid #ffffff44;border-radius:999px;padding:9px 18px">English · 中文</span>
  <span style="background:#ffffff22;border:1px solid #ffffff44;border-radius:999px;padding:9px 18px">Local-first AI</span>
  <span style="background:#f4a259;color:#3b2106;border-radius:999px;padding:9px 18px">No real money</span>
 </div>
</div>
<div style="position:absolute;left:720px;top:130px;width:900px;border-radius:18px;overflow:hidden;box-shadow:0 30px 80px #00000066;border:6px solid #ffffff22;transform:rotate(-2deg)">
 <img src="data:image/png;base64,${home}" style="width:900px;display:block">
</div></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.setContent(html, { waitUntil: "load" });
await p.screenshot({ path: "/home/claude/junior-investor/deploy/market/assets/featured.png" });
await b.close();
