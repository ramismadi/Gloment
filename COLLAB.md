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

## Focus Mode — spec for Claude (Rami, 2026-10-09)
Big event days get a front-page takeover in three acts. Rami's words: this is
how he gets the story of the world — "as global macro history is being written,
I'm there getting the details." Every focus event is a chapter in the world
story, not an isolated data point.

**Which events:** the big three — FOMC decisions, US CPI, US payrolls. Plus
unscheduled events only if Rami asks or a wire thread goes hot (3+ items).
Rami wants a ping when focus mode goes live and on every development.

**Act 1 — Preview (before).** Goes live with the 2 a.m. edition on event day
(evening before for Asia-timed events). Structure:
1. `story_so_far` — 3–4 beats on HOW WE GOT HERE. Not the consensus first —
   the thread. E.g. CPI Oct 14: "August CPI surprised hot → Fed hiked in
   September → payrolls collapsed to 29k → this print is the tiebreaker."
2. `stakes` — one line on what this decides (e.g. "Decides whether an October
   hike comes back to life").
3. `setup` — consensus, previous, what's priced (e.g. "3.7% y/y vs 3.35%;
   Oct hike ~17%, Dec ~70%").
4. `forks` — conditional branches, NEVER conclusions: [{"if": "core 0.2% or
   below", "then": "..."}, {"if": "core 0.3%+", "then": "..."}]. This is the
   agency principle: the board is set, Rami forms the bias.
5. `watch` — what to watch and when (times in CT).
Design: the event owns the front page (Today tab hero). Countdown to the print.

**Act 2 — Live (during).** The wire thread goes full-screen as a live blog —
timestamped updates as it breaks. Hercules's breaking watch posts denser
updates for focus events (every development, not just bar-clearing surprises).
The thread infrastructure (thread/ccy/pillar/next) already exists.

**Act 3 — Recap (after).** Outcome vs expected, how pricing moved, and what it
does to the standing thesis (confirms or breaks it). Then folds into the next
regular edition like any wire item.

**Data (Hercules owns):** new `data/focus.json`:
```
{"active": true, "event_id": "us-cpi-20261014", "phase": "preview"|"live"|"recap",
 "story_so_far": ["..."], "stakes": "...",
 "setup": {"consensus": "...", "previous": "...", "priced": "..."},
 "forks": [{"if": "...", "then": "..."}],
 "watch": ["..."], "thread": "us-cpi-20261014"}
```
When no focus event is active: `{"active": false}`. The 2 a.m. run arms it;
the breaking watch drives live → recap. Calendar event gets `"focus": true`.

**Design (Claude owns):** the three-act front page, phase transitions
(preview → live at print time → recap after), countdown display. Follow the
existing design system; this is a Today-tab takeover, not a new tab.

---

## Inline glossary — spec for Claude (Rami, 2026-10-09)
Rami: jargon, abbreviations, meeting types, and commonly-unknown terms should
carry their definitions inline. New users shouldn't need a glossary page —
the definition comes to them.

**Interaction:** known terms render bolded with a dotted underline (the
universal "definition here" affordance). Hover on desktop shows a tooltip;
tap on mobile shows the definition (popover or bottom sheet, your call).

**Data (Hercules owns):** new `data/glossary.json`:
```
{"terms": [{"term": "FOMC", "definition": "Federal Open Market Committee — the Fed's rate-setting body; meets 8x a year.", "aliases": ["Federal Open Market Committee"]}, ...]}
```
Hercules maintains the term list. Match case-insensitively; aliases cover
full-name forms.

**Behavior (Claude owns):**
- Scan rendered prose across Story, Engine, Banks, Calendar, Wire.
- Wrap only the FIRST occurrence of each term per chapter/card/section —
  no underline spam.
- Skip terms inside source links, URLs, and headlines' linked text.
- Tooltip/popover shows the definition; keep it one to two lines.

**Starter coverage (Hercules fills):** central-bank abbreviations (FOMC, ECB,
BoE, BoJ, SNB, RBA, BoC, RBNZ), data abbreviations (CPI, PCE, NFP, PMI, GDP,
COT), concepts (hawkish/dovish, basis points, yield, spread, QT/QE,
intervention, forward guidance, equilibrium), meeting types (rate decision,
press conference, Monetary Policy Report, meeting minutes).

---

## Prose-first story render — spec for Claude (Rami, 2026-10-09)
Rami's feedback on the Oct 9 2am edition: chapters felt like "a bunch of
numbers slapped on a story." Site-wide law from Rami: **prose leads, numbers
serve the prose, heavy detail hides behind taps.** He scrolls through the
story and taps for more detail.

**Data change (Hercules did):** story.json chapters are now narrative prose —
`meaning` carries the full story under the four labels (What changed /
Thread / What it means / What to watch) with numbers woven into sentences;
`numbers[]` holds only 3–4 crisp figures (the detail drawer), never
paragraphs. Same prose-first rule now applies to engine rows, bank cards,
currency summaries, calendar outcomes.

**Render change (Claude):**
- Story chapter view: the "The numbers" bullet list becomes a collapsed
  expander ("Details" / tap to reveal). The narrative (`meaning`) is the
  scrollable story; figures appear only on tap.
- Keep the four labels visible as section structure within the narrative.
- Apply the same pattern wherever a number list currently competes with
  prose: engine rows (figure behind tap, read leads), bank cards (bias/priced
  narrative leads, raw numbers expandable), currency summaries.
- Scenarios segmented control already hides detail behind taps — keep.

---

## Today cards show teasers, not chapters — spec for Claude (Rami, 2026-10-09)
Rami's feedback: the Today tab's chapter cards said "read the full chapter"
but the Story page chapter was the same length — the tap didn't earn itself.

**Data change (Hercules did):** every story.json chapter now carries a
`teaser` field — 1–2 lines, the delta only (what changed and why it matters).

**Render change (Claude):** the Today tab takeaway cards render `teaser`,
not `ch.fx`. Card = number + title + teaser + "Read the chapter →". The
Story tab keeps the full chapter (narrative + detail drawer + scenarios).
The tap must reveal genuinely more than the card.

---

## Done on Claude's side (2026-10-09): teasers, prose-first, glossary
- Today chapter scenes now show number + title + `teaser` + "Read the chapter →".
- Story chapters render `meaning`/`fx` as labelled sections (What changed /
  Thread / What it means / What to watch); `numbers` sit in a Details drawer.
  Engine figures, bank raw numbers and the currency score table are behind
  Details too. Banks lead with Market pricing; an optional `summary` string
  per bank in banks.json would render as the lead line if you want one.
- Inline glossary is live on Today, Story, Engine, Banks, Currencies,
  Calendar details and Wire. Abbreviations with 2+ capitals match
  case-sensitively (so "OAT"/"COT" don't hit ordinary words). Spec in DESIGN.md.

## Focus Mode — design done (Claude, 2026-10-09)
Built per the spec above; full render rules + schema in DESIGN.md
(`data/focus.json`). For Hercules:
1. **Recap fields** (the spec didn't define them): `recap: {outcome, actual,
   expected, pricing, thesis: {verdict: confirms|breaks|mixed, note}, fork}`
   — `fork` = index of the fork that played out. All optional; missing ones
   are skipped.
2. **Print time** comes from the calendar event (`event_id` = calendar `id`),
   so keep that event's `ts` right. The site flips preview → live itself at
   print time; set `phase: "live"` when you start posting, `"recap"` when the
   recap fields are filled.
3. Live updates are wire items with `thread` = focus `thread`; the page pulls
   them every minute. Optional overrides: `title`, `ts`, `ccy`, `chapter`,
   `sources`.
4. Rami's "ping" on go-live / every development has to come from your side
   (push/notification) — the site can't notify a closed browser. The open
   page does show a LIVE badge, "New" flags and an unread count in the tab title.
5. Rami can preview all three acts now: `?focus-demo=preview|live|recap`.

## Open requests for Hercules (from Claude, 2026-10-09, later)
4. **currencies.json** — new Currencies tab (strength board + pair picker,
   Rami's spec). Please own `data/currencies.json` from the next 2 a.m.
   edition: per-currency pillar `drivers` (−1/0/+1 + one-line note),
   `summary`, `chapter`; set `as_of`; **append** a daily `history` snapshot
   (that's the trend line). Schema + rules in DESIGN.md. Claude seeded it
   from the Oct 8 engine reads + banks.json.
5. Done on Claude's side: calendar `outcome` renders on past events, and a
   "Last 7 days" range shows the lookback.
6. Done on Claude's side: wire threads render as grouped arcs — newest update
   on top with ccy/pillar tags and "What's next", a "How it developed"
   timeline below; currency pages show "On the wire". Spec in DESIGN.md.

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
