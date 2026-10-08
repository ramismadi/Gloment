# Working on Gloment — agent collaboration guide

## What this is
Gloment (GLObal fundaMENTals) is Rami's FX macro desk — a static site on GitHub
Pages at ramismadi.github.io/Gloment/. It publishes a daily story-format FX
outlook (numbers → what they mean → what happens to the currencies), a
six-pillar macro engine dashboard, breaking news, and live quotes. Audience:
Rami and anyone he shares the link with. Content tone: direct, numbers-first,
no ceremony. Market context only — never trade recommendations, never financial
advice.

## Architecture
- `index.html` — page shell; dynamic sections are empty containers filled by JS.
- `assets/style.css` — sunny alpine theme: bright sky blues, pale gold accents,
  light greys, white surfaces. Airy daytime feel. Terminal-desk aesthetic
  (monospace tabular numerals, compact data rows). Keep it light — Rami
  rejected a darker version.
- `assets/app.js` — on load: fetches live FX quotes from
  https://open.er-api.com/v6/latest/USD (free, no key) and renders 10 pairs;
  fetches `data/*.json` via relative paths and renders each section. All DOM
  built with textContent (no HTML injection). Graceful fallback if the quote
  fetch fails. Also drives the JS-rendered dashboard chrome: sticky status bar
  (live local/UTC clocks, TYO/LDN/NYC session chips), scrolling ticker tape,
  and day-change % pills (computed vs previous ECB fixing via frankfurter.app,
  labeled in-page).
- Dashboard panels (structure in `index.html`, styling in `assets/style.css`):
  live quotes board, macro engine, central-bank scorecard (policy
  rate / next meeting / priced move / bias — only the Fed row is data-backed;
  other banks show "—" when not in the current edition), economic calendar
  (CT times, currently hardcoded from the catalyst seed), breaking wire
  (from `data/latest.json`), and the story chapters (from `data/story.json`).
  The scorecard/calendar/ticker are presentational — they are NOT fed by
  `data/*.json`, so update their seed values by hand when they go stale.
- `data/engine.json` — six macro pillars:
  `{"updated": "<ISO-8601>", "rows": [{"id","title","figure","read"}]}`.
  Row ids: `policy`, `growth`, `inflation`, `risk`, `terms`, `positioning`.
  One line per row: key figure + FX read-through.
- `data/story.json` — daily edition:
  `{"date":"YYYY-MM-DD","headline":"...","chapters":[{"title","numbers":[],
  "meaning":"...","fx":"...","scenarios":{"base","bull","bear"}}]}`.
- `data/latest.json` — breaking items, reverse-chronological:
  `{"items":[{"ts":"<ISO-8601>","headline":"...","bullets":[],
  "sources":[]}]}`.

## Clickable sources (for whoever writes `data/*.json`)
Source labels now link to the original article/page when a URL is supplied.
Links open in a new tab (`rel="noopener noreferrer"`); only `http(s)` URLs are
honoured. Everything is backward compatible: with no URL, the label renders as
plain text exactly as before. Never guess or fabricate a URL — link the actual
article/series page you used, or leave the URL out.
- `engine.json` rows and `story.json` chapters: keep `"source"` (string) and add
  `"source_url"` for a single source, or use `"sources": [{"label","url"}, ...]`
  (items may also be plain strings) when a row cites several.
- `latest.json` items: `"sources"` may hold `{"label","url"}` objects (or
  strings, as before); optional `"url"` on the item makes the headline itself
  a link.
- Deep links beat homepages: prefer the specific article, FRED series page,
  or release over a publisher front page.

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

## If you're Claude reading this
Rami asked Hercules to leave this for you. The above is the full picture.
When in doubt about who should do what, ask Rami — he'd rather answer than
untangle a merge conflict.
