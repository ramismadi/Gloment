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
- `assets/style.css` — premium tabbed desk. Colors are token sets on
  `<html data-theme="…">`. Light: **alpine** (default — sky blues, pale gold,
  white; keep the default light, Rami rejected a dark default), **ivory**,
  **sage**, **porcelain**, **claret**, **harbor**, **dusk**. Dark
  (opt-in only): **midnight**, **ink**, **forest**, **onyx**,
  **velvet**. Readers pick from the
  theme dropdown in the masthead; the choice is saved in localStorage. To add
  or remove a theme, edit both its `[data-theme]` token block in style.css and
  its entry in the `THEMES` list in app.js. Every theme defines the same
  tokens — add new colors as tokens, never as hard-coded hex in components.
- Cache-busting: `index.html` loads `assets/style.css?v=N` and
  `assets/app.js?v=N`, and `ASSET_VERSION` at the top of `app.js` must equal
  N. **Bump all three whenever style.css or app.js changes** — app.js
  re-fetches index.html on load and reloads once if it sees a newer N (this
  is how stale home-screen installs heal themselves) —
  GitHub Pages lets browsers cache assets ~10 min, and a new page with a stale
  script breaks the UI (this happened with the theme dropdown).
- `assets/app.js` — on load: fetches `data/*.json` via relative paths and renders
  each view. All DOM built with textContent (no HTML injection). Hash-routed
  tabs: `#today`, `#story` (`#story/2` = chapter 2), `#engine`, `#banks`,
  `#calendar`, `#wire`. No live price widgets — Rami removed them (unreliable
  feeds); this is a story/full-picture site, not a quote terminal.
- Session chips (masthead): SYD 07–16, TYO 09–18, LDN 08–17, NYC 08–17,
  each in its own city's local time via Intl time zones (DST-correct),
  Mon–Fri, and only while the FX week is open (Sun 17:00 → Fri 17:00 New
  York). Hover shows hours and an opens/closes-in countdown. Holidays are
  not modelled.
- Fonts: serif (Source Serif 4 → Georgia) for headlines and the story lede;
  system sans for UI and body; monospace (`--mono`) only for tabular numerals
  (clock, engine figures, bank rates, calendar dates/times, wire timestamps).
- Design principle: **less text up front, depth on demand.** Each view leads
  with the takeaway and tucks detail behind a click:
  - Today — headline, one card per story chapter (title + its `fx` line),
    macro pulse (each pillar's `read`), next 3 calendar items, latest wire.
  - Story — one chapter at a time: `fx` callout first, then `meaning`, the
    `numbers`, and a Base/Bull/Bear switch showing one scenario at a time.
  - Engine — six tiles: `read` big, `figure` small.
  - Wire — headline + the `FX:` bullet; `Numbers:`/`Meaning:` bullets sit
    behind "Full detail". Keep the `Numbers:` / `Meaning:` / `FX:` prefixes
    on wire bullets — the renderer splits on them.
  So write data with that in mind: `fx` and `read` should be short, punchy
  one-liners (they are what people see first); depth goes in `numbers`,
  `meaning`, and the scenarios.
- Central banks + calendar are hand-seeded in `index.html` (NOT fed by
  `data/*.json`) — update by hand when stale. Calendar entries with
  `data-key` are highlighted; Today's "Next up" shows the first three `<li>`s,
  so drop past events from the top of the list.
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

## Keep the docs current
COLLAB.md is shared. Edit only the section you're changing, starting from the
latest `main` — don't paste an older copy over the whole file (the
Architecture section has been reverted twice that way). The Architecture and
theme notes describe the live design; Claude maintains them.

## If you're Claude reading this
Rami asked Hercules to leave this for you. The above is the full picture.
When in doubt about who should do what, ask Rami — he'd rather answer than
untangle a merge conflict.
