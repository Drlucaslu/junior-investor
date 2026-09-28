"""Generate the Olares Application Chart (OAC) for Junior Investor.

  python build_chart.py market   -> out/market/juniorinvestor   (Olares Market submission; no personal defaults)
  PERSONAL_LLM_BASE_URL=... PERSONAL_LLM_MODEL=... python build_chart.py personal  (same chart + your own LLM default)
"""
import os
import shutil
import sys
import textwrap

VERSION = "0.4.0"        # chart version (Olares Market)
IMAGE_TAG = "0.4.0"      # container image tag (unchanged app code)
API_VERSION = "v3"       # OlaresManifest apiVersion: v3 = Olares 1.12.6+
OLARES_RANGE = ">=1.12.6-0"
GH_USER = "Drlucaslu"
REPO = f"https://github.com/{GH_USER}/junior-investor"
RAW = f"https://raw.githubusercontent.com/{GH_USER}/junior-investor/main/deploy/market/assets"
IMAGE = f"ghcr.io/{GH_USER.lower()}/junior-investor:{IMAGE_TAG}"
SCREENS = [f"{RAW}/screenshot-{i}.webp" for i in range(1, 9)]

FULL_EN = """\
Junior Investor is a calm, private place for kids and teens (ages 10–18) to learn how good investors think — with virtual money only.

**Learn first, then unlock**

- **Learning path** – five levels: Saver → Lender → Index Investor → Stock Picker → Options Apprentice. Each level unlocks a new kind of investment (cash and CDs, bond funds, index funds, individual stocks, then beginner options on shares you own) and adds virtual cash to the learning account. Levels are earned with short lessons (with a quick check question) and historical scenarios.
- **Time machine** – travel back to real market history (the 2000 dot-com bubble, the 2007 smartphone revolution, the 2008 financial crisis, the 2020 pandemic, the 2022 rate shock) with company names hidden. Split $10,000, explain why, jump forward in time, then see what really happened.
- **Two accounts** – a gamified learning account on a family leaderboard ranked by learning points (never by returns), and a private family account that parents fund with starting cash and scheduled pocket money.

**Three things to do, one learning loop**

- **Ask a Master** – chat with AI teaching personas inspired by the publicly documented principles of Warren Buffett, Peter Lynch, Benjamin Graham and Charlie Munger. Answers adapt to the child's age, and any current fact (price, revenue, valuation) is looked up with tools, never guessed.
- **Research a company** – type a ticker, a company name or a question ("Why is Costco's valuation so high?"). The Research Agent gathers live quotes, financial statements, valuation metrics, SEC filings and news, then writes a source-cited report (Company in one minute, Business model, Growth drivers, Bull & Bear case, What could change the thesis…). Numbers in tables come straight from the data, not from the AI.
- **Practice with a simulated portfolio** – start with virtual cash (default US$1,000,000), buy and sell US stocks and ETFs at real market prices, and track P&L. Every trade asks "Why are you making this trade?" and saves it to an investment journal for later reflection.

**Built for families**

- Parent mode protected by a PIN: create child profiles, set starting cash and daily AI limits, reset portfolios, view learning progress.
- Fully bilingual (English / 简体中文); Chinese finance terms are shown with their English names and abbreviations.
- No real brokerage, no real money, no leverage, no leaderboards, no gamified trading — rewards go to research, journaling and learning.
- Local-first: profiles, trades, journals and chats stay on your Olares. Use the AI model running on your Olares, or any OpenAI-compatible cloud model (OpenAI, Claude, Gemini, DeepSeek, OpenRouter, Qwen…) chosen by the parent in Settings.

Not investment advice. Market data may be delayed.
"""

FULL_ZH = """\
少年投资家是一个安静、私密的地方，帮助 10–18 岁的孩子用虚拟资金学习优秀投资者是如何思考的。

**先学习，再解锁**

- **学习路线**：五个等级——储蓄者 → 债权人 → 指数投资者 → 选股者 → 期权学徒。每升一级解锁一种新的投资品种（现金与定期存单、债券基金、指数基金、个股，最后是针对已持有股票的入门期权），并为学习账户增加虚拟资金。升级靠短课程（附小测验）和历史情景。
- **历史时光机**：穿越回真实的市场历史（2000 年互联网泡沫、2007 年智能手机革命、2008 年金融危机、2020 年疫情、2022 年利率飙升），公司名称隐藏。分配 1 万美元、写下理由、跳到未来，再看看真实发生了什么。
- **两个账户**：游戏化的学习账户参加家庭排行榜（按学习积分排名，从不按收益）；私人家庭账户由父母注资，可设置定期零花钱。

**三件事，一个学习闭环**

- **请教大师**：与基于巴菲特、彼得·林奇、格雷厄姆、芒格公开投资思想构建的 AI 教学角色对话。回答会按孩子的年龄调整难度；涉及股价、营收、估值等当前事实时，一定先用工具查询，绝不凭空猜测。
- **研究一家公司**：输入股票代码、公司名或一个问题（例如“为什么 Costco 的估值一直比较高？”）。投研 Agent 会收集实时行情、财务报表、估值指标、SEC 公告和新闻，生成带来源标注的研究报告（一分钟了解公司、商业模式、增长来源、乐观/悲观情景、什么会改变判断……）。表格里的数字直接来自数据，而不是 AI 生成。
- **模拟盘练习**：用虚拟资金（默认 100 万美元）按真实市场价格买卖美股和 ETF，跟踪盈亏。每次交易都会问“你为什么做这笔交易？”，并记录到投资日志中，方便日后复盘。

**为家庭设计**

- 家长模式由 PIN 保护：创建孩子档案、设置初始资金和每日 AI 使用额度、重置账户、查看学习进度。
- 完整中英双语；中文界面的金融术语同时标注英文全称和缩写。
- 不连接真实券商、不涉及真实资金、没有杠杆、没有排行榜、不鼓励频繁交易——奖励只给研究、写日志和学习。
- 本地优先：档案、交易、日志和对话都保存在你的 Olares 上。AI 可以使用 Olares 本机模型，也可以由家长在设置里选择任何 OpenAI 兼容的云端模型（OpenAI、Claude、Gemini、DeepSeek、OpenRouter、通义千问等）。

不构成投资建议，行情数据可能有延迟。
"""

UPGRADE_EN = "New learning path: five levels that unlock cash & CDs, bond funds, index funds, stocks and beginner options as children learn. Historical time-machine scenarios with hidden company names, lessons with quick checks, learning points, badges and a family leaderboard ranked by learning (not returns). Each child now has a learning account and a private family account with optional scheduled pocket money. Existing portfolios become the family account."
UPGRADE_ZH = "全新学习路线：五个等级，随学习逐步解锁现金与定期存单、债券基金、指数基金、个股和入门期权。新增隐藏公司名称的历史时光机情景、带小测验的课程、学习积分、徽章，以及按学习积分（而非收益）排名的家庭排行榜。每个孩子现在有学习账户和私人家庭账户，家庭账户可设置定期零花钱。原有投资组合自动成为家庭账户。"


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def block(s: str, indent: int) -> str:
    return textwrap.indent(s.rstrip() + "\n", " " * indent)


def manifest(lang: str, llm_default: str, llm_model: str) -> str:
    zh = lang == "zh"
    title = "少年投资家" if zh else "Junior Investor"
    desc = "儿童/青少年投资学习与模拟交易" if zh else "Kids learn investing: AI masters, research & paper trading"
    return f"""olaresManifest.version: '0.12.0'
olaresManifest.type: app
apiVersion: '{API_VERSION}'

workloadReplicas:
  juniorinvestor: 1

metadata:
  name: juniorinvestor
  appid: juniorinvestor
  title: {q(title)}
  description: {q(desc)}
  icon: {RAW}/icon.png
  version: '{VERSION}'
  categories:
    - Lifestyle
    - agents
  tags:
    - finance
    - lifestyle
    - chatbot

entrances:
  - name: juniorinvestor
    host: juniorinvestor
    port: 8000
    title: {q(title)}
    icon: {RAW}/icon.png
    authLevel: private
    openMethod: window

spec:
  versionName: '{VERSION}'
  runAsUser: true
  fullDescription: |
{block(FULL_ZH if zh else FULL_EN, 4)}  upgradeDescription: |
{block(UPGRADE_ZH if zh else UPGRADE_EN, 4)}  developer: Lucas Lu
  website: {REPO}
  sourceCode: {REPO}
  submitter: Lucas Lu
  doc: {REPO}#readme
  locale:
    - en-US
    - zh-CN
  promoteImage:
{chr(10).join('    - ' + s for s in SCREENS)}
  featuredImage: {RAW}/featured.webp
  license:
    - text: MIT
      url: {REPO}/blob/main/LICENSE
  requiredCpu: 100m
  limitedCpu: '2'
  requiredMemory: 256Mi
  limitedMemory: 2Gi
  requiredDisk: 200Mi
  limitedDisk: 5Gi
  supportArch:
    - amd64

permission:
  appData: true
  appCache: true

options:
  apiTimeout: 0
  dependencies:
    - name: olares
      version: '{OLARES_RANGE}'
      type: system

envs:
  - envName: LLM_BASE_URL
    required: false
    type: string
    editable: true
    applyOnChange: true
    default: {q(llm_default)}
    description: Optional default OpenAI-compatible AI endpoint (parents can also choose a model in the app's Settings)
  - envName: LLM_MODEL
    required: false
    type: string
    editable: true
    applyOnChange: true
    default: {q(llm_model)}
    description: Optional default model name
  - envName: LLM_API_KEY
    required: false
    type: password
    editable: true
    applyOnChange: true
    default: ''
    description: Optional API key for the default endpoint
"""


DEPLOYMENT = """apiVersion: apps/v1
kind: Deployment
metadata:
  name: juniorinvestor
  namespace: {{ .Release.Namespace }}
  labels:
    app: juniorinvestor
spec:
  replicas: {{ .Values.workloads.juniorinvestor.replicaCount }}
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: juniorinvestor
  template:
    metadata:
      labels:
        app: juniorinvestor
    spec:
      initContainers:
        - name: init-permissions
          image: docker.io/beclab/busybox:1.37
          command: ["sh", "-c", "mkdir -p /data && chown -R 1000:1000 /data"]
          securityContext:
            runAsUser: 0
          volumeMounts:
            - name: data
              mountPath: /data
      containers:
        - name: juniorinvestor
          image: IMAGE_PLACEHOLDER
          imagePullPolicy: IfNotPresent
          securityContext:
            runAsUser: 1000
            runAsGroup: 1000
            allowPrivilegeEscalation: false
          ports:
            - containerPort: 8000
              name: http
          env:
            - name: APP_ENV
              value: production
            - name: HOME
              value: /data
            - name: DATABASE_URL
              value: sqlite:////data/junior_investor.db
            - name: LLM_PROVIDER
              value: olares-local
            - name: LLM_BASE_URL
              value: {{ (.Values.olaresEnv).LLM_BASE_URL | default "" | quote }}
            - name: LLM_MODEL
              value: {{ (.Values.olaresEnv).LLM_MODEL | default "" | quote }}
            - name: LLM_API_KEY
              value: {{ (.Values.olaresEnv).LLM_API_KEY | default "" | quote }}
            - name: LLM_TIMEOUT
              value: "300"
            - name: MARKET_DATA_PROVIDER
              value: yahoo
            - name: FUNDAMENTALS_PROVIDER
              value: yahoo
            - name: SEARCH_PROVIDER
              value: duckduckgo
          startupProbe:
            httpGet: {path: /healthz, port: 8000}
            periodSeconds: 5
            failureThreshold: 36
          readinessProbe:
            httpGet: {path: /healthz, port: 8000}
            periodSeconds: 10
          livenessProbe:
            httpGet: {path: /healthz, port: 8000}
            periodSeconds: 30
            failureThreshold: 6
          resources:
            requests: {cpu: 100m, memory: 256Mi}
            limits: {cpu: "2", memory: 2Gi}
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          hostPath:
            path: {{ .Values.userspace.appData }}/juniorinvestor
            type: DirectoryOrCreate
"""

SERVICE = """apiVersion: v1
kind: Service
metadata:
  name: juniorinvestor
  namespace: {{ .Release.Namespace }}
spec:
  selector:
    app: juniorinvestor
  ports:
    - name: http
      port: 8000
      targetPort: 8000
"""


def i18n(lang: str) -> str:
    zh = lang == "zh"
    title = "少年投资家" if zh else "Junior Investor"
    desc = "儿童/青少年投资学习与模拟交易" if zh else "Kids learn investing: AI masters, research & paper trading"
    return f"""metadata:
  title: {q(title)}
  description: {q(desc)}
spec:
  fullDescription: |
{block(FULL_ZH if zh else FULL_EN, 4)}  upgradeDescription: |
{block(UPGRADE_ZH if zh else UPGRADE_EN, 4)}"""


def build(kind: str) -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "out", kind, "juniorinvestor")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(os.path.join(out, "templates"))
    # "personal" = same chart with your own default endpoint taken from the environment (never committed).
    llm = (os.environ.get("PERSONAL_LLM_BASE_URL", ""), os.environ.get("PERSONAL_LLM_MODEL", "")) if kind == "personal" else ("", "")
    w = lambda p, s: open(os.path.join(out, p), "w").write(s)  # noqa: E731
    w("Chart.yaml", f"apiVersion: v2\nname: juniorinvestor\ndescription: Junior Investor - kids investment learning and paper trading\ntype: application\nversion: '{VERSION}'\nappVersion: '{IMAGE_TAG}'\n")
    w("values.yaml", "# Olares injects userspace / olaresEnv values at install time.\nworkloads:\n  juniorinvestor:\n    replicaCount: 1\n")
    w("OlaresManifest.yaml", manifest("en", *llm))
    for loc, lang in (("en-US", "en"), ("zh-CN", "zh")):
        os.makedirs(os.path.join(out, "i18n", loc))
        w(os.path.join("i18n", loc, "OlaresManifest.yaml"), i18n(lang))
    w("owners", f"owners:\n- {GH_USER}\n")
    w(os.path.join("templates", "deployment.yaml"), DEPLOYMENT.replace("IMAGE_PLACEHOLDER", IMAGE))
    w(os.path.join("templates", "service.yaml"), SERVICE)
    return out


if __name__ == "__main__":
    for k in sys.argv[1:] or ["market", "personal"]:
        print(build(k))
