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
- `assets/app.js` — on load: fetches `data/*.json` via relative paths and renders
  each section. All DOM built with textContent (no HTML injection). Also drives
  the JS-rendered dashboard chrome: sticky status bar (live local/UTC clocks,
  TYO/LDN/NYC session chips). No live price widgets — Rami removed them
  (unreliable feeds); this is a story/full-picture site, not a quote terminal.
  Price levels appear only inside the narrative data.
- Fonts: system sans stack (`-apple-system` first, so Apple devices render
  San Francisco; Inter via Google Fonts elsewhere). Monospace (`--mono`) is
  reserved strictly for tabular numerals: status-bar clocks, engine figures,
  bank-table numbers, calendar times, wire timestamps. Everything else is sans.
- Layout order (top to bottom): sticky status bar → hero header → **The Story**
  (the core: daily narrative from `data/story.json`) → dashboard grid (macro
  engine, central-bank scorecard, economic calendar, breaking wire) → footer.
  The story is the product; everything else supports it.
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

## If you're Claude reading this
Rami asked Hercules to leave this for you. The above is the full picture.
When in doubt about who should do what, ask Rami — he'd rather answer than
untangle a merge conflict.
