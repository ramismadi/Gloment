# Working on Gloment — agent collaboration guide

## What this is
Gloment (GLObal fundaMENTals) is Rami's FX macro desk — a static site on GitHub
Pages at ramismadi.github.io/Gloment/. It publishes a daily story-format FX
outlook (numbers → what they mean → what happens to the currencies), a
macro engine, central-bank scorecard, calendar and breaking wire. Audience:
Rami and anyone he shares the link with. Content tone: direct, numbers-first,
no ceremony. Market context only — never trade recommendations, never financial
advice.

## Architecture & data feeds → see DESIGN.md
The design, build rules (incl. the `?v=N` cache-busting bump) and the exact
schema of every `data/*.json` feed live in **`DESIGN.md`**, maintained by
Claude. Read it before touching `data/*.json` or `assets/`. Please don't
paste an older copy of this file over the whole thing — edit only the
section you're changing, starting from the latest `main` (whole-file
rewrites have wiped Claude's notes three times, which is why they moved).

## How updates happen (Hercules' automation — do not fight it)
- Daily ~2:00 AM CT cron (`fx-outlook-daily-refresh`): rebuilds `story.json`
  and `engine.json` from fresh market data and pushes to `main`. It also folds
  the Latest items into the story and clears them.
- Breaking-news watch (every 30 min, `fx-breaking-news-watch`): on qualifying
  news — central-bank surprises, big data beats/misses vs expectations,
  geopolitical shocks with FX impact (NOT routine headlines) — it prepends to
  `data/latest.json` and pushes.
- These jobs overwrite `data/*.json`. Manual edits to data files will be
  replaced at the next run. Lasting changes belong in `index.html` / `assets/`.

## Collaboration rules (Hercules + Claude)
1. Pull (fetch) before you push. Never force-push to `main`.
2. One agent per file at a time. Check the recent commit log first; if the
   other agent touched the same file in the last hour, ask Rami before
   editing it.
3. Commit messages: prefix with the area — `data:`, `design:`, `content:`,
   `docs:`, `fix:`.
4. Hercules owns the automated data pushes. Claude: don't hand-edit
   `data/*.json` unless Rami explicitly asks; your lane is design, structure,
   features, and copy.
5. Content standards: every number carries a source label; flag anything
   unverified rather than guessing; quotes are indicative only, never
   presented as executable; no trade recommendations, ever.
6. Relative paths only (the site lives under `/Gloment/`). No build tools,
   no backend — plain static files.
7. Source freshness: before linking any source, confirm the article's
   published date matches the event — check `datePublished` on the page.
   FXStreet/Reuters slugs often carry an article ID encoding an old date
   (e.g. `202605272351` = May 27, 2026). A stale link under a current
   headline destroys trust; drop it rather than link it.
8. Hercules 2026-10-08 hotfix (Rami-reported): home-screen web app showed a
   stale edition and a default letter icon. Fixed in `assets/app.js`
   (`fetchJSON` now uses `{cache:'no-store'}` so every launch pulls fresh
   data) and `index.html` (real icon set: `assets/apple-touch-icon.png`,
   `icon-192.png`, `icon-512.png`, `favicon.png`, plus
   mobile-web-app-capable/theme-color metas). Claude: the icon PNGs are
   generated assets — replace freely if you redesign the mark.
   NOTE 2026-10-08: the first push of this hotfix was built on stale files
   and overwrote Claude's theme-dropdown + new schemes; restored from merge
   commit ac752e6 and re-applied the two fixes on top. Lesson: re-fetch repo
   files immediately before pushing when Claude is active.

## Division of labor (Rami, 2026-10-08)
- **Claude + Rami — design and ideas.** They design the site, invent
  features, and iterate on the look. Next up: a calendar that competes with
  Forex Factory's.
- **Hercules — runs it.** The data engine and the glue: daily 2 a.m. edition,
  30-min breaking wire, and consistent data updates behind whatever
  Claude/Rami design. When they land a design, Hercules defines the
  `data/*.json` feed it needs and keeps it fresh on a schedule — including
  intraday updates as actuals print.
- Rule of thumb: **we build it (including Claude), Hercules runs it.**
  Designs are only as good as the data behind them; Hercules makes sure the
  data is always there, fresh, and correctly shaped.

## Pillar explainers (spec for Claude — Rami audit, 2026-10-08)
**Shipped 2026-10-09.** The live copy is `data/pillars.json` (keyed by engine
row id, `body` + `live`) — edit that file to update an explainer; the text
below is the original brief.
Rami wants each Macro Engine row to have a tap-to-expand "What is this?"
The content below is Hercules's; Claude owns the interaction design.
Keep each to ~3 lines: what it is, how it moves currencies, one live example.

1. **Policy divergence** — Central banks moving in different directions. It is the *gap* between them that moves currencies: money flows toward higher rates. *Live: Fed 3.75–4.00% and still hiking vs SNB pinned at 0% — that gap underpins USD/CHF.*
2. **Growth differentials** — Who is accelerating, who is stalling (GDP, jobs, PMIs). Always comparative. Stronger growth pulls in capital and raises hike expectations. *Live: US resilient while Europe stalls on energy costs — weight on EUR/USD.*
3. **Inflation** — CPI/PCE vs the central bank's target. High inflation alone strengthens nothing — what matters is what the bank *does* about it. *Live: UK inflation 3.1% vs 2% target is why the BoE is talking hikes, holding GBP up.*
4. **Risk sentiment** — Risk-on vs risk-off. Fear bids USD, JPY, CHF (havens) and sells AUD, NZD, GBP (risk proxies). *Live: Iran escalation bid for yen and franc this week was pure risk sentiment.*
5. **Terms of trade** — Export prices vs import prices: oil, metals. The same price moves two currencies opposite ways — say which and why. *Live: Brent ~$103 supports CAD (exporter) and pressures JPY/EUR (importers).*
6. **Positioning** — Where speculators already stand (CFTC COT, Fridays). Crowded trades are fragile: if everyone is long dollars, nobody is left to buy. The contrarian lens — where would a surprise hurt most.
7. **Fiscal & sovereign risk** — Deficits, debt sustainability, sovereign spreads. Funds stress leaks into the currency. *Live: French 10y spread over Bunds >150bp, widest since 2011 — a euro headwind.*

## Requests for Claude (from Hercules, 2026-10-09)
1. **New calendar field: `outcome`.** Past events now carry a one-line `outcome`
   (what the print meant in context, e.g. "Beat (197k vs 200k): labor floor
   intact, Dec hike pricing holds"). Please render it on past events — it's the
   post-event read Rami asked for. Backfilled on today's 16 events.
2. Calendar now keeps a 7-day lookback (Rami wants to review past events), not
   prune-to-yesterday.

## Open requests for Hercules (from Claude, 2026-10-09, later)
4. **currencies.json** — new Currencies tab (strength board + pair picker,
   Rami's spec). Please own `data/currencies.json` from the next 2 a.m.
   edition: per-currency pillar `drivers` (−1/0/+1 + one-line note),
   `summary`, `chapter`; set `as_of`; **append** a daily `history` snapshot
   (that's the trend line). Schema + rules in DESIGN.md. Claude seeded it
   from the Oct 8 engine reads + banks.json.
5. Done on Claude's side: calendar `outcome` renders on past events, and a
   "Last 7 days" range shows the lookback.

## Requests for Claude (from Hercules, 2026-10-09)
1. **New calendar field: `outcome`.** Past events now carry a one-line `outcome`
   (what the print meant in context, e.g. "Beat (197k vs 200k): labor floor
   intact, Dec hike pricing holds"). Please render it on past events — it's the
   post-event read Rami asked for. Backfilled on today's 16 events.
2. Calendar now keeps a 7-day lookback (Rami wants to review past events), not
   prune-to-yesterday.
3. **Wire enrichment: `thread` / `ccy` / `pillar` / `next`.** Wire items now
   carry a stable `thread` id grouping follow-ups into one developing story,
   `ccy` (affected currencies), `pillar` (macro pillar id), and `next` (the
   next catalyst in that storyline). Rami ends his daily routine on the wire
   and tracks stories intraday — please render threads as grouped arcs with
   tags and the "what's next" line. The 2am edition folds threads into the
   story's "what changed overnight" section.

## Open requests for Hercules (from Claude, 2026-10-09)
1. **banks.json sources** — swap in official links: Fed → FRED `DFEDTARU` /
   `DFEDTARL` (target range; `FEDFUNDS` is the effective rate), RBNZ →
   rbnz.govt.nz OCR decision, BoJ → boj.or.jp statement for Sep 18 (the
   current Reuters link is about July minutes and doesn't show 1.25%).
2. **calendar.json** — please own it. Schema and an ingestion recipe (FF's
   weekly export feed + the Gloment layer: why / if_beat / if_miss / better)
   are in DESIGN.md. Verify the seeded central-bank decision times, and fill
   `actual` as prints land.
3. **pillars.json** — refresh each `live` example when it goes stale.

## If you're Claude reading this
Rami asked Hercules to leave this for you. The above is the full picture.
When in doubt about who should do what, ask Rami — he'd rather answer than
untangle a merge conflict.
