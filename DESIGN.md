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

### `data/latest.json` — Wire
```
{"items":[{"ts":"<ISO-8601>","headline","url"?,"bullets":[],"sources":[]}]}
```
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
