# Gloment — design & data-feed spec

**Maintained by Claude.** This is the source of truth for how the site looks,
how it is built, and the exact shape of every `data/*.json` feed.
Hercules: read it before touching `data/*.json` or `assets/`; please don't
rewrite it — tell Rami (or note it in COLLAB.md) if something here is wrong.
Collaboration rules and the update schedule live in `COLLAB.md`.

## Product shape
A premium, tabbed FX macro desk. Principle: **less text up front, depth on
demand** — every view leads with the takeaway and tucks detail behind a click.

| Tab | Route | Fed by |
|---|---|---|
| Today | `/` (also `#today`) | story, engine, calendar, latest |
| Story | `#story`, `#story/2` = chapter 2 | `data/story.json` |
| Currencies | `#fx`, `#fx/AUD` = currency page | `data/currencies.json` (+ banks, calendar, story joins) |
| Macro engine | `#engine` | `data/engine.json` + `data/pillars.json` |
| Central banks | `#banks` | `data/banks.json` |
| Calendar | `#calendar` | `data/calendar.json` (+ banks.json join) |
| Wire | `#wire` | `data/latest.json` |

- The GLOMENT wordmark and the Today tab go to the clean site URL (no hash).
- No live price widgets (Rami removed them). Price levels appear only in the
  narrative data.

## Build & deploy
- Plain static files, relative paths only (site lives under `/Gloment/`).
  No build step, no backend. All DOM is built with `textContent` — never
  inject HTML from data.
- **Cache-busting:** `index.html` loads `assets/style.css?v=N` and
  `assets/app.js?v=N`, and `ASSET_VERSION` at the top of `app.js` must equal
  N. **Bump all three whenever style.css or app.js changes.** On load, app.js
  re-fetches index.html and reloads once if it sees a newer N — this is how
  cached pages and home-screen installs heal themselves.
- Only http(s) URLs become links; they open in a new tab with
  `rel="noopener noreferrer"`.

## Look
- Themes are token sets on `<html data-theme="…">`, picked from the swatch
  dropdown in the masthead and saved per reader (localStorage).
  Light: **alpine** (default — keep the default light), **ivory**, **sage**,
  **porcelain**, **claret**, **harbor**, **dusk**.
  Dark (opt-in): **ink**, **forest**, **onyx**, **velvet**.
  To add/remove a theme, edit its `[data-theme]` block in style.css *and* its
  entry in `THEMES` in app.js. Every theme defines the same tokens; never
  hard-code hex in component rules.
- Fonts: serif (Source Serif 4 → Georgia) for headlines and ledes; system sans
  for UI/body; monospace only for tabular numerals.
- Session chips (masthead): SYD 07–16, TYO 09–18, LDN 08–17, NYC 08–17, each
  in its own city's local time (DST-correct), Mon–Fri, and only while the FX
  week is open (Sun 17:00 → Fri 17:00 New York). Holidays not modelled.

## Writing data for this design
`fx` (story) and `read` (engine) are what people see first — short, punchy
one-liners. Depth goes in `numbers`, `meaning`, scenarios, `why`.
Never guess or fabricate a number, date or URL; leave it `null` and it renders
gracefully. Link the specific article / series page / release, not a homepage,
and check its published date matches the event.

### Sources (all feeds)
Any `sources` field is an array of `{"label", "url"}` (plain strings also
work). Engine rows and story chapters may instead use `"source"` (string) +
`"source_url"`. Wire items may add `"url"` to link the headline.

### `data/story.json`
```
{"date":"YYYY-MM-DD","headline":"...",
 "chapters":[{"title","fx","meaning","numbers":[],
   "scenarios":{"base","bull","bear"},"sources":[]}]}
```

### `data/engine.json`
```
{"updated":"<ISO-8601>","rows":[{"id","title","figure","read","sources":[]}]}
```
Row ids: `policy`, `growth`, `inflation`, `risk`, `tot`, `positioning`,
`fiscal`. Any number of rows works — the grid balances itself and the
"N pillars" label counts them.

### `data/pillars.json` — "What is this?" explainers
```
{"pillars":{"<engine row id>":{"title","body","live"}}}
```
`body` = what it is + how it moves currencies (static). `live` = one current
example — refresh it when conditions change. A pillar without an entry simply
has no "What is this?" button.

### `data/currencies.json` — Currencies (strength board + pair picker)
```
{"updated":"<ISO-8601>","as_of":"YYYY-MM-DD",   // edition date
 "method":"Score = sum of pillar scores (-1 / 0 / +1) ...",
 "currencies":[{"ccy":"AUD","name":"Australian dollar","bank":"rba",
   "chapter":3|null,                 // story chapter behind this currency
   "summary":"one line — why it sits where it does",
   "drivers":{"policy":{"score":1,"note":"RBA hiked +25bp Sep 29 to 4.60%"},
              "risk":{"score":-1,"note":"Risk-off tilt — AUD soft"}, ...}}],
 "history":[{"date":"YYYY-MM-DD","scores":{"USD":3,"EUR":-2,...}}],
 "pairs":{}}                         // reserved: per-pair notes / typical range
```
- Pillar keys match the engine: `policy`, `growth`, `inflation`, `risk`,
  `tot`, `positioning`, `fiscal`. Omit a pillar (or score 0) when it isn't a
  driver; every non-zero score needs a one-line `note`.
- The site computes the score (sum of drivers), ranks the board, and builds
  the pair picker: for "bullish X" each counterpart Y is ranked by
  `score(X) − score(Y)` (Best ≥ 2, Good 1, No edge 0, Avoid < 0), shown in
  market convention (EUR > GBP > AUD > NZD > USD > CAD > CHF > JPY), with
  carry from `banks.json` rates and high-impact events in the next 14 days
  from `calendar.json`.
- **Daily (2 a.m. edition):** rewrite `drivers`/`summary` from that morning's
  engine reads and banks, set `as_of`, and **append** one
  `{"date","scores"}` snapshot to `history` (keep ~60 days). History is what
  draws each currency's trend line and the ▲/▼ change on the board — never
  rewrite past entries.
- Scoring is v1 on purpose (Rami + Claude will refine weights/pillars over
  time); keep the method string accurate if it changes.

### `data/latest.json` — Wire
```
{"items":[{"ts":"<ISO-8601>","headline","url"?,"bullets":[],"sources":[],
  "thread":"us-iran-20261008",     // same id = one developing story
  "ccy":["USD","JPY"],             // affected currencies → tags link to #fx/CCY
  "pillar":"risk",                 // engine pillar id → tag links to #engine
  "next":"Next: ..."}]}            // next catalyst in the storyline
```
Renders as **threads**: items sharing a `thread` id become one card headed
by the newest update (headline, currency + pillar tags, FX line, "What's
next" from the newest item's `next`, sources), with a "How it developed"
timeline of every update below. Items without `thread` stand alone. Threads
sort by their newest update; the tab badge counts threads. Currency pages
list the threads tagged with that currency ("On the wire").
Keep the `Numbers:` / `Meaning:` / `FX:` prefixes on bullets — the FX line
shows by default, the rest sits behind "Full detail".

### `data/banks.json` — Central banks
```
{"updated":"<ISO-8601>","banks":[{"id","short","name","ccy",
  "rate":"2.50%"|null, "rate_label":"Deposit facility rate",
  "last_move":{"date":"YYYY-MM-DD","bp":25|-25|0}|null,
  "next_meeting":{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"?}|null,
  "priced":"Oct hike ~60%"|null, "bias":"hawkish"|"neutral"|"dovish"|null,
  "sources":[]}]}
```
A bank with `rate`, `priced` or `bias` gets a full card; others show date
only. Cards sort by soonest meeting. Use the headline policy rate (Fed: the
target range; ECB: deposit facility) and say which in `rate_label`. Source
the rate from the bank's own site (Fed target range: FRED `DFEDTARU` /
`DFEDTARL`; `FEDFUNDS` is the *effective* rate).

### `data/calendar.json` — Calendar
```
{"updated":"<ISO-8601>","events":[{
  "id":"us-cpi-20261014",          // stable, unique
  "ts":"2026-10-14T12:30:00Z",     // UTC instant; or omit ts and give
  "date":"2026-10-30","time_tbd":true,  //   a date when the time is unknown
  "ccy":"USD", "impact":"high"|"medium"|"low",
  "category":"inflation"|"jobs"|"growth"|"central-bank"|"speech"|"auction"|"sentiment"|...,
  "title":"CPI y/y (Sep)",
  "actual":null, "forecast":"3.4%", "previous":"3.35%",
  "better":"higher"|"lower"|null,  // which direction is good for the currency
  "why":"one line on why it matters",
  "if_beat":"...", "if_miss":"...", // central-bank events: hawkish / dovish
  "chapter":1,                     // story chapter to link, optional
  "bank":"fed",                    // joins banks.json for decisions, optional
  "sources":[]}]}
```
Past events may carry `"outcome"`: one line on what the print meant (shown
under the title and as "What it meant" in the briefing). The feed keeps a
7-day lookback; the "Last 7 days" range shows it.

How it renders: times shown in the reader's chosen zone (local by default),
grouped by day, filterable by range / impact / currency, live countdowns, a
"Now" marker, actual vs forecast coloured beat/miss using `better`, and an
expandable briefing (why / beat / miss / bank today / story link / add to
calendar). Today's "Next up" shows the next three high/medium events.

**Keeping it fresh (Hercules):** the seed covers only the events the site
already listed plus central-bank decisions at each bank's standard
announcement time — verify those times. To cover the full weekly slate,
ingest ForexFactory's weekly export feed
(`https://nfs.faireconomy.media/ff_calendar_thisweek.json`; check their
terms and poll sparingly) and map: `country`→`ccy`, `impact`
High/Medium/Low→`impact` (skip Holiday or show as low), `date`→`ts` (convert
to UTC), `forecast`, `previous`. The feed has no actuals — fill `actual` as
prints land (that's what turns rows green/red). Then add the Gloment layer
FF doesn't have: `why`, `if_beat`/`if_miss`, `better`, `chapter`, `bank`.
