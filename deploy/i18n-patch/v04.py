# v0.4 i18n additions. Run: python3 v04.py  (merges into apps/web/src/locales/*/common.json)
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2] / "apps/web/src/locales"

EN = {
 "nav": {"path": "Learning Path", "scenarios": "Time Machine"},
 "accounts": {
  "learning": "Learning account", "family": "Family account",
  "learningShort": "Learning", "familyShort": "Family",
  "learningDesc": "Grows as you learn: pass lessons and time-machine scenarios to unlock new assets and more virtual cash.",
  "familyDesc": "Your private account, funded by your parents (starting cash and pocket money). Not on any leaderboard.",
  "switch": "Choose account", "contributions": "Deposits", "contributionsHint": "Pocket money, parent deposits and level bonuses. Deposits are not profit.",
  "nextAllowance": "Next pocket money: {{amount}} on {{date}}", "cdValue": "Savings (CDs)", "optionValue": "Options"
 },
 "assets": {"cash": "Cash", "cd": "CDs (Certificates of Deposit)", "bond_etf": "Bond funds (bond ETFs)", "equity_etf": "Stock index funds (equity ETFs)",
            "stock": "Individual stocks", "options": "Options (covered calls & protective puts)"},
 "path": {
  "title": "Learning Path", "subtitle": "Learn first, then unlock. Each level adds a new kind of investment and more virtual cash to your learning account.",
  "levelN": "Level {{n}}", "currentLevel": "Your level", "xp": "Learning points", "xpWeek": "this week", "xpTotal": "total",
  "xpHint": "Points come from lessons, time-machine scenarios, research and writing down your reasons — never from how often you trade or how much you earn.",
  "nextStep": "Your next step", "allDone": "You've reached the top level. Keep practising — and try every scenario!",
  "startLesson": "Start lesson", "startScenario": "Play scenario", "unlocks": "Unlocks", "bonus": "+{{amount}} virtual cash",
  "requirements": "To unlock", "unlocked": "Unlocked", "locked": "Locked", "done": "Done", "lesson": "Lesson", "scenario": "Scenario",
  "progress": "{{done}} of {{total}} done", "badges": "Badges", "badgeEarned": "Earned", "badgeLocked": "Not yet",
  "parentSet": "A parent started you at level {{n}}.", "levelUp": "Level up! You reached level {{n}}: {{title}}.",
  "allowedNow": "You can invest in"
 },
 "leaderboard": {
  "title": "Family leaderboard", "subtitle": "Ranked by learning points this week — not by returns. Everyone can climb by learning.",
  "rank": "Rank", "learner": "Learner", "week": "This week", "total": "Total", "level": "Level", "badges": "Badges", "you": "you",
  "empty": "Add another child profile to compare progress."
 },
 "scenarios": {
  "title": "Time Machine", "subtitle": "Travel back to real moments in market history. Company names are hidden until the end, so you judge the business — not the brand.",
  "years": "{{n}} years", "companies": "{{n}} choices", "requiredFor": "Needed for level {{n}}", "bonusScenario": "Bonus scenario",
  "notStarted": "Not started", "inProgress": "In progress · decision {{step}} of {{total}}", "completed": "Completed", "best": "Best result {{pct}}",
  "start": "Start", "continue": "Continue", "playAgain": "Play again", "review": "See results",
  "startValue": "You start with {{amount}} of virtual money.", "company": "Company {{key}}", "cash": "Cash",
  "cashNote": "Cash earns no interest in this simulation.",
  "allocate": "Split your money", "allocateHint": "Move the sliders so the total is 100%.", "total": "Total", "remaining": "{{pct}} left to place", "over": "{{pct}} too much",
  "reason": "Why did you choose this split?", "reasonPlaceholder": "Explain your thinking in a sentence or two. (At least 10 characters.)",
  "reasonNeeded": "Please write at least 10 characters about why.",
  "lockIn": "Lock in and jump to {{date}}", "finish": "Lock in and see what happened by {{date}}",
  "news": "What happened", "yourValue": "Your money now", "sinceStart": "since the start", "chart": "Price since the start (start = 100)",
  "market": "Overall market (S&P 500)", "equalSplit": "Equal split, never changed", "yourResult": "Your result", "vsMarket": "Overall market",
  "reveal": "The big reveal", "whatHappened": "What really happened", "approx": "Prices approximate (company delisted)",
  "yourDecisions": "Your decisions", "decisionAt": "{{date}}", "lessons": "Lessons", "discuss": "Think about it", "askMaster": "Discuss with a Master",
  "maxDrawdown": "Biggest drop along the way", "annualized": "per year", "bestChoice": "Best single choice in hindsight: {{key}}", "delisted": "Delisted",
  "leverageTitle": "What borrowed money would have done", "leverageText": "The overall market fell {{dd}} at its worst. An investor using 2x leverage (borrowing as much as they owned) would have lost {{lev}} — {{wiped}}",
  "wipedOut": "wiped out before the recovery came.", "notWipedOut": "a much deeper hole to climb out of.",
  "xpEarned": "+{{n}} learning points", "discussPrompt": "I just played the “{{title}}” time-machine scenario. My result was {{ret}} vs the market's {{mkt}}. What should I learn from my decisions?",
  "step": "Decision {{n}} of {{total}}", "today": "It is {{date}}"
 },
 "cd": {
  "title": "Open a CD", "open": "Open a CD", "subtitle": "A CD (Certificate of Deposit) locks your money for a fixed time at a fixed rate. Safe, but slow.",
  "term": "Length", "months": "{{n}} months", "apy": "APY (Annual Percentage Yield)", "amount": "Amount", "atMaturity": "At maturity you get about",
  "penalty": "Take it out early and you lose about {{n}} month(s) of interest.", "rateSource": "Rates follow the real 13-week US Treasury bill yield.",
  "confirm": "Open CD", "opened": "CD opened. Your money is growing!", "list": "Savings (CDs)", "principal": "Put in", "value": "Worth now",
  "matures": "Matures", "withdraw": "Take out early", "withdrawConfirm": "Taking this CD out early pays you {{amount}} (early-withdrawal penalty included). Continue?",
  "withdrawn": "CD withdrawn. The money is back in cash.", "interestSoFar": "Interest so far", "empty": "No CDs yet."
 },
 "options": {
  "title": "Options (simulated)", "open": "Options", "subtitle": "Two beginner strategies on shares you already own. 1 contract = 100 shares.",
  "covered_call": "Covered call", "protective_put": "Protective put",
  "coveredCallDesc": "SELL a call on your shares: collect the premium now, but agree to sell your shares at the strike if the price ends above it.",
  "protectivePutDesc": "BUY a put on your shares: pay a premium, like insurance, so you can still sell at the strike if the price falls.",
  "symbol": "Shares you own", "noShares": "You need at least 100 shares of a stock in this account to use options.",
  "expiry": "Expiration date", "strike": "Strike price", "premium": "Premium (per share)", "contracts": "Contracts", "maxContracts": "You can use up to {{n}}",
  "delta": "Delta", "days": "{{n}} days", "preview": "Preview", "confirm": "Confirm", "opened": "Option position opened.",
  "youReceive": "You receive now", "youPay": "You pay now", "ifAbove": "If the price ends above {{strike}}: your {{shares}} shares are sold at {{strike}}. Total with premium: {{total}}.",
  "ifBelowCall": "If the price ends below {{strike}}: you keep your shares and the premium.",
  "ifBelowPut": "If the price ends below {{strike}}: you can still sell at {{strike}} — worst case {{worst}} for your {{shares}} shares.",
  "ifAbovePut": "If the price ends above {{strike}}: the put expires worthless. The premium was the cost of protection.",
  "model": "Prices are estimated with the Black-Scholes model using the stock's past volatility ({{vol}}). Real option prices differ.",
  "list": "Options", "close": "Close early", "closeConfirm": "Close this option position now at the current simulated price?", "closed": "Option closed.",
  "sharesLocked": "{{n}} shares are promised to a covered call and can't be sold until it is closed or expires.",
  "empty": "No options yet.", "expires": "Expires", "unrealized": "Profit / loss if closed now", "reason": "Why are you using this strategy?"
 },
 "coach": {
  "frequentTitle": "Slow down, investor", "frequent": "You've made {{n}} trades in this account in the last 7 days. Great investors usually trade rarely and think long-term. Is this trade part of your plan?",
  "lockedTitle": "Not unlocked yet", "locked": "{{asset}} unlock at level {{level}} of your learning path.", "goPath": "See how to unlock"
 },
 "allowance": {
  "title": "Pocket money", "subtitle": "Automatically add virtual cash to {{name}}'s family account, like an allowance.",
  "amount": "Amount", "frequency": "How often", "weekly": "Every week", "monthly": "Every month", "weekday": "Day of the week", "dayOfMonth": "Day of the month",
  "enabled": "On", "save": "Save", "saved": "Pocket money saved.", "remove": "Turn off", "none": "No pocket money set up.",
  "next": "Next: {{date}}", "summary": "{{amount}} {{freq}}", "deposit": "One-time deposit", "depositNote": "Note (optional)", "depositDo": "Deposit",
  "deposited": "Deposit added to the family account.", "days": {"d0": "Monday", "d1": "Tuesday", "d2": "Wednesday", "d3": "Thursday", "d4": "Friday", "d5": "Saturday", "d6": "Sunday"}
 },
 "errors": {
  "ASSET_LOCKED": "This kind of investment isn't unlocked yet for this account. Check your Learning Path to see how to unlock it.",
  "SHARES_LOCKED_BY_CALL": "Some of these shares are promised to a covered call. Close the call first, or sell fewer shares.",
  "CD_MIN_AMOUNT": "A CD needs at least $100.", "INVALID_TERM": "Please choose a CD length.", "CD_NOT_FOUND": "This CD isn't open any more.",
  "NOT_ENOUGH_SHARES": "You need 100 shares for each contract (not already used by another option).",
  "INVALID_STRIKE": "Please pick a strike price from the list.", "INVALID_EXPIRY": "Please pick an expiration date from the list.",
  "INVALID_CONTRACTS": "Please enter a valid number of contracts.", "INVALID_STRATEGY": "Please choose a strategy.", "OPTION_NOT_FOUND": "This option isn't open any more.",
  "ALLOCATION_NOT_100": "Your split must add up to exactly 100%.", "REASON_REQUIRED": "Please write a short reason (at least 10 characters).",
  "INVALID_ALLOCATION": "One of the amounts isn't valid.", "ASSET_UNAVAILABLE": "That company isn't available at this point in history.",
  "SCENARIO_FINISHED": "This scenario is already finished. Start a new game to play again.", "SCENARIO_NOT_FOUND": "This scenario isn't available.",
  "RUN_NOT_FOUND": "This game couldn't be found.", "QUIZ_ANSWER_REQUIRED": "Choose an answer first."
 },
 "learn": {
  "level": "Difficulty {{n}}",
  "check": "Quick check", "checkHint": "Answer correctly to complete this lesson.", "checkAnswer": "Check answer", "correct": "Correct!", "tryAgain": "Not quite — read the lesson again and try once more.",
  "pathLesson": "Level {{n}} lesson", "xp": "+{{n}} learning points"
 },
 "home": {
  "welcome": "You have two accounts: a learning account that starts with $10,000 and grows as you learn, and a family account with {{cash}} from your parents. Your goal is not to trade as much as possible — it is to learn how good investors think.",
  "pathTitle": "Your learning path", "pathCta": "Open path", "accountsTitle": "Your two accounts", "timeMachine": "Time machine",
  "timeMachineDesc": "Travel back to 2000, 2008 or 2020 and test your judgement."
 },
 "trade": {"account": "Account"},
 "parent": {
  "learningTitle": "Learning path & accounts", "level": "Level", "levelAuto": "Automatic (earned by learning)", "levelOverride": "Start at level",
  "levelOverrideHint": "Useful for older children who already know the basics. Level bonuses are credited to the learning account.",
  "familyAccess": "Family account can buy", "familyAccessAll": "Stocks & ETFs (parent's choice)", "familyAccessLevel": "Only what the learning level unlocks",
  "resetLearning": "Reset learning account", "resetLearningConfirm": "Reset {{name}}'s learning account? History is kept; the account restarts with $10,000 plus earned level bonuses.",
  "resetWhich": "Account to reset", "xp": "Learning points", "scenarios": "Scenarios finished", "saved": "Saved."
 },
 "achievement": {"levelUp": "Level up!", "scenario": "Scenario complete!"},
 "terms": {"strike": "Strike", "covered_call": "Covered call", "protective_put": "Protective put", "cd": "CD", "apy": "APY", "option": "Option", "premium": "Premium"}
}

ZH = {
 "nav": {"path": "学习路线", "scenarios": "历史时光机"},
 "accounts": {
  "learning": "学习账户", "family": "家庭账户", "learningShort": "学习", "familyShort": "家庭",
  "learningDesc": "随学习成长：通过课程和历史时光机情景，解锁新的投资品种和更多虚拟资金。",
  "familyDesc": "你的私人账户，由父母注资（初始资金和零花钱），不参加任何排行榜。",
  "switch": "选择账户", "contributions": "存入", "contributionsHint": "零花钱、家长存入和等级奖励。存入的钱不算盈利。",
  "nextAllowance": "下次零花钱：{{date}} 存入 {{amount}}", "cdValue": "储蓄（定期存单）", "optionValue": "期权"
 },
 "assets": {"cash": "现金", "cd": "定期存单（Certificate of Deposit, CD）", "bond_etf": "债券基金（债券 ETF）", "equity_etf": "股票指数基金（股票 ETF）",
            "stock": "个股", "options": "期权（备兑看涨与保护性看跌）"},
 "path": {
  "title": "学习路线", "subtitle": "先学习，再解锁。每升一级，学习账户就会多一种投资品种和更多虚拟资金。",
  "levelN": "第 {{n}} 级", "currentLevel": "你的等级", "xp": "学习积分", "xpWeek": "本周", "xpTotal": "累计",
  "xpHint": "积分来自课程、历史时光机情景、投研报告和写下投资理由——与交易次数和赚多少钱无关。",
  "nextStep": "下一步", "allDone": "你已经达到最高等级。继续练习——试试所有的历史情景吧！",
  "startLesson": "开始学习", "startScenario": "开始情景", "unlocks": "解锁", "bonus": "奖励 {{amount}} 虚拟资金",
  "requirements": "解锁条件", "unlocked": "已解锁", "locked": "未解锁", "done": "已完成", "lesson": "课程", "scenario": "情景",
  "progress": "已完成 {{done}}/{{total}}", "badges": "徽章", "badgeEarned": "已获得", "badgeLocked": "未获得",
  "parentSet": "家长让你从第 {{n}} 级开始。", "levelUp": "升级啦！你达到了第 {{n}} 级：{{title}}。",
  "allowedNow": "现在可以投资"
 },
 "leaderboard": {
  "title": "家庭排行榜", "subtitle": "按本周学习积分排名——不按收益排名。人人都能靠学习往上爬。",
  "rank": "排名", "learner": "学习者", "week": "本周", "total": "累计", "level": "等级", "badges": "徽章", "you": "你",
  "empty": "再添加一个孩子档案，就可以一起比较学习进度。"
 },
 "scenarios": {
  "title": "历史时光机", "subtitle": "穿越回市场历史上的真实时刻。公司名称到最后才揭晓，让你判断的是生意本身，而不是品牌。",
  "years": "{{n}} 年", "companies": "{{n}} 个选项", "requiredFor": "第 {{n}} 级解锁条件", "bonusScenario": "附加情景",
  "notStarted": "未开始", "inProgress": "进行中 · 第 {{step}}/{{total}} 次决策", "completed": "已完成", "best": "最好成绩 {{pct}}",
  "start": "开始", "continue": "继续", "playAgain": "再玩一次", "review": "查看结果",
  "startValue": "你有 {{amount}} 虚拟资金。", "company": "{{key}} 公司", "cash": "现金",
  "cashNote": "本模拟中现金没有利息。",
  "allocate": "分配你的钱", "allocateHint": "拖动滑块，让合计等于 100%。", "total": "合计", "remaining": "还剩 {{pct}} 未分配", "over": "超出 {{pct}}",
  "reason": "你为什么这样分配？", "reasonPlaceholder": "用一两句话说说你的想法。（至少 10 个字）",
  "reasonNeeded": "请至少写 10 个字说明理由。",
  "lockIn": "确定，穿越到 {{date}}", "finish": "确定，看看到 {{date}} 发生了什么",
  "news": "这段时间发生了什么", "yourValue": "你现在的钱", "sinceStart": "相比起点", "chart": "从起点开始的价格（起点 = 100）",
  "market": "整体市场（标普 500）", "equalSplit": "平均分配、从不调整", "yourResult": "你的结果", "vsMarket": "整体市场",
  "reveal": "揭晓答案", "whatHappened": "真实发生了什么", "approx": "价格为近似值（公司已退市）",
  "yourDecisions": "你的决策", "decisionAt": "{{date}}", "lessons": "学到的道理", "discuss": "想一想", "askMaster": "和大师聊聊",
  "maxDrawdown": "过程中最大跌幅", "annualized": "年化", "bestChoice": "事后看最好的单一选择：{{key}}", "delisted": "已退市",
  "leverageTitle": "如果借钱投资会怎样", "leverageText": "整体市场最多下跌 {{dd}}。使用 2 倍杠杆（借了和本金一样多的钱）的投资者会亏损 {{lev}}——{{wiped}}",
  "wipedOut": "在反弹到来之前就被清零了。", "notWipedOut": "要爬出一个深得多的坑。",
  "xpEarned": "+{{n}} 学习积分", "discussPrompt": "我刚玩了“{{title}}”历史时光机情景。我的结果是 {{ret}}，整体市场是 {{mkt}}。我应该从我的决策里学到什么？",
  "step": "第 {{n}}/{{total}} 次决策", "today": "现在是 {{date}}"
 },
 "cd": {
  "title": "开一张定期存单", "open": "开定期存单", "subtitle": "定期存单（Certificate of Deposit, CD）把钱按固定利率锁定一段固定时间。安全，但增长慢。",
  "term": "期限", "months": "{{n}} 个月", "apy": "年化收益率（APY）", "amount": "金额", "atMaturity": "到期大约可以拿回",
  "penalty": "提前取出，大约损失 {{n}} 个月的利息。", "rateSource": "利率跟随真实的美国 13 周国库券收益率。",
  "confirm": "开存单", "opened": "存单已开，你的钱正在增长！", "list": "储蓄（定期存单）", "principal": "存入", "value": "当前价值",
  "matures": "到期日", "withdraw": "提前取出", "withdrawConfirm": "提前取出这张存单可得 {{amount}}（已扣除提前支取违约金）。继续吗？",
  "withdrawn": "存单已取出，钱回到现金。", "interestSoFar": "已获利息", "empty": "还没有定期存单。"
 },
 "options": {
  "title": "期权（模拟）", "open": "期权", "subtitle": "针对已持有股票的两种入门策略。1 张合约 = 100 股。",
  "covered_call": "备兑看涨", "protective_put": "保护性看跌",
  "coveredCallDesc": "针对你的股票卖出看涨期权：现在收到权利金，但如果到期股价高于行权价，就要以行权价卖出股票。",
  "protectivePutDesc": "为你的股票买入看跌期权：付出权利金（像保险费），股价下跌时仍能以行权价卖出。",
  "symbol": "你持有的股票", "noShares": "这个账户里需要至少持有某只股票 100 股，才能使用期权。",
  "expiry": "到期日", "strike": "行权价", "premium": "权利金（每股）", "contracts": "合约数", "maxContracts": "最多可用 {{n}} 张",
  "delta": "Delta（德尔塔）", "days": "{{n}} 天", "preview": "预览", "confirm": "确认", "opened": "期权仓位已建立。",
  "youReceive": "你现在收到", "youPay": "你现在支付", "ifAbove": "如果到期股价高于 {{strike}}：你的 {{shares}} 股以 {{strike}} 卖出，含权利金共 {{total}}。",
  "ifBelowCall": "如果到期股价低于 {{strike}}：你保留股票和权利金。",
  "ifBelowPut": "如果到期股价低于 {{strike}}：你仍能以 {{strike}} 卖出——{{shares}} 股最坏也值 {{worst}}。",
  "ifAbovePut": "如果到期股价高于 {{strike}}：看跌期权作废，权利金就是保护的成本。",
  "model": "价格由布莱克-斯科尔斯模型（Black-Scholes）根据该股票过去的波动率（{{vol}}）估算，与真实期权价格不同。",
  "list": "期权", "close": "提前平仓", "closeConfirm": "按当前模拟价格立即平掉这个期权仓位？", "closed": "期权已平仓。",
  "sharesLocked": "有 {{n}} 股已被备兑看涨期权锁定，在期权平仓或到期前不能卖出。",
  "empty": "还没有期权。", "expires": "到期", "unrealized": "现在平仓的盈亏", "reason": "你为什么使用这个策略？"
 },
 "coach": {
  "frequentTitle": "慢一点，投资者", "frequent": "过去 7 天你在这个账户交易了 {{n}} 次。优秀的投资者通常很少交易、着眼长期。这笔交易在你的计划里吗？",
  "lockedTitle": "尚未解锁", "locked": "{{asset}}在学习路线第 {{level}} 级解锁。", "goPath": "看看怎么解锁"
 },
 "allowance": {
  "title": "零花钱", "subtitle": "像零花钱一样，定期自动往 {{name}} 的家庭账户存入虚拟资金。",
  "amount": "金额", "frequency": "频率", "weekly": "每周", "monthly": "每月", "weekday": "星期几", "dayOfMonth": "每月几号",
  "enabled": "开启", "save": "保存", "saved": "零花钱设置已保存。", "remove": "关闭", "none": "还没有设置零花钱。",
  "next": "下次：{{date}}", "summary": "{{freq}} {{amount}}", "deposit": "一次性存入", "depositNote": "备注（可选）", "depositDo": "存入",
  "deposited": "已存入家庭账户。", "days": {"d0": "星期一", "d1": "星期二", "d2": "星期三", "d3": "星期四", "d4": "星期五", "d5": "星期六", "d6": "星期日"}
 },
 "errors": {
  "ASSET_LOCKED": "这个账户还没有解锁这类投资。去学习路线看看怎么解锁吧。",
  "SHARES_LOCKED_BY_CALL": "部分股票已被备兑看涨期权锁定。请先平掉看涨期权，或少卖一些。",
  "CD_MIN_AMOUNT": "定期存单至少需要 100 美元。", "INVALID_TERM": "请选择存单期限。", "CD_NOT_FOUND": "这张存单已经不在了。",
  "NOT_ENOUGH_SHARES": "每张合约需要 100 股（且未被其他期权占用）。",
  "INVALID_STRIKE": "请从列表中选择行权价。", "INVALID_EXPIRY": "请从列表中选择到期日。",
  "INVALID_CONTRACTS": "请输入有效的合约数量。", "INVALID_STRATEGY": "请选择一个策略。", "OPTION_NOT_FOUND": "这个期权已经不在了。",
  "ALLOCATION_NOT_100": "分配比例合计必须正好是 100%。", "REASON_REQUIRED": "请写一个简短的理由（至少 10 个字）。",
  "INVALID_ALLOCATION": "有一个比例不正确。", "ASSET_UNAVAILABLE": "在这个历史时点无法买入这家公司。",
  "SCENARIO_FINISHED": "这个情景已经结束了。重新开始就能再玩一次。", "SCENARIO_NOT_FOUND": "这个情景不可用。",
  "RUN_NOT_FOUND": "找不到这局游戏。", "QUIZ_ANSWER_REQUIRED": "请先选择一个答案。"
 },
 "learn": {
  "level": "难度 {{n}}",
  "check": "小测验", "checkHint": "答对才能完成这节课。", "checkAnswer": "检查答案", "correct": "答对了！", "tryAgain": "不太对——再读一遍课程，再试一次。",
  "pathLesson": "第 {{n}} 级课程", "xp": "+{{n}} 学习积分"
 },
 "home": {
  "welcome": "你有两个账户：一个是从 1 万美元起步、随学习成长的学习账户；另一个是父母为你存入 {{cash}} 的家庭账户。目标不是尽可能多地交易，而是学习优秀投资者如何思考。",
  "pathTitle": "你的学习路线", "pathCta": "打开学习路线", "accountsTitle": "你的两个账户", "timeMachine": "历史时光机",
  "timeMachineDesc": "穿越回 2000、2008 或 2020 年，检验你的判断力。"
 },
 "trade": {"account": "账户"},
 "parent": {
  "learningTitle": "学习路线与账户", "level": "等级", "levelAuto": "自动（靠学习获得）", "levelOverride": "起始等级",
  "levelOverrideHint": "适合已经懂基础知识的大孩子。等级奖励会存入学习账户。",
  "familyAccess": "家庭账户可以买", "familyAccessAll": "股票和 ETF（由家长决定）", "familyAccessLevel": "只能买学习等级已解锁的品种",
  "resetLearning": "重置学习账户", "resetLearningConfirm": "要重置 {{name}} 的学习账户吗？历史记录会保留；账户以 1 万美元加上已获得的等级奖励重新开始。",
  "resetWhich": "要重置的账户", "xp": "学习积分", "scenarios": "完成的情景", "saved": "已保存。"
 },
 "achievement": {"levelUp": "升级啦！", "scenario": "情景完成！"},
 "terms": {"strike": "行权价", "covered_call": "备兑看涨", "protective_put": "保护性看跌", "cd": "定期存单（CD）", "apy": "年化收益率（APY）", "option": "期权", "premium": "权利金"}
}


def merge(dst, src):
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            merge(dst[k], v)
        else:
            dst[k] = v


for lang, patch in (("en", EN), ("zh-CN", ZH)):
    p = ROOT / lang / "common.json"
    d = json.loads(p.read_text())
    merge(d, patch)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
print("merged")
