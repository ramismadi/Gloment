/* Gloment — premium desk renderer. Plain static JS, no build step.
   Tabbed views (hash-routed: #today, #story, #story/2, #engine, #banks,
   #calendar, #wire), a theme picker, and edition data (story, macro engine,
   wire) from local JSON files. textContent-only DOM, no HTML injection. */

(function () {
  'use strict';

  /* Must equal the ?v= on app.js in index.html — bump both together. */
  var ASSET_VERSION = '18';

  var TABS = ['today', 'story', 'fx', 'engine', 'banks', 'calendar', 'wire'];
  /* Theme catalogue. `sw` = swatch preview colors [background, accent, highlight].
     Token values live in style.css under [data-theme="<id>"]. */
  var THEMES = [
    { id: 'alpine',    name: 'Alpine',    desc: 'Sky blue & gold',        sw: ['#f3f8fc', '#1668a3', '#d9a441'] },
    { id: 'ivory',     name: 'Ivory',     desc: 'Navy & brass',           sw: ['#f6f2ea', '#1f3a5f', '#a07a32'] },
    { id: 'sage',      name: 'Sage',      desc: 'Forest & sand',          sw: ['#f2f4ef', '#2f5d4a', '#c9ad7f'] },
    { id: 'porcelain', name: 'Porcelain', desc: 'Slate & rose gold',      sw: ['#f4f5f7', '#3b4a63', '#b07a5e'] },
    { id: 'claret',    name: 'Claret',    desc: 'Burgundy & cream',       sw: ['#f7f3ef', '#6e1f30', '#a8803c'] },
    { id: 'harbor',    name: 'Harbor',    desc: 'Deep teal & copper',     sw: ['#f1f5f5', '#0f5560', '#b26b3c'] },
    { id: 'dusk',      name: 'Dusk',      desc: 'Plum & champagne',       sw: ['#f5f2f5', '#4b2f5c', '#a8884f'] },
    { id: 'ink',       name: 'Ink',       desc: 'Ink, ivory & copper',    sw: ['#131a26', '#e9dcbc', '#cf9259'], dark: true },
    { id: 'forest',    name: 'Forest',    desc: 'Dark green & brass',     sw: ['#0e1714', '#9fd0b5', '#d2b072'], dark: true },
    { id: 'onyx',      name: 'Onyx',      desc: 'Black & champagne',      sw: ['#0f0f10', '#e2c98f', '#6cc794'], dark: true },
    { id: 'velvet',    name: 'Velvet',    desc: 'Oxblood, rosé & gold',   sw: ['#1e1216', '#e8a9a0', '#d6ad62'], dark: true }
  ];
  var story = null;      // story.json, once loaded
  var chapterIdx = 0;    // chapter shown in the Story tab

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    checkFreshness();
    watchUpdates();
    initTheme();
    initTabs();
    startClock();
    initScrollStory();

    fetchJSON('data/story.json').then(function (d) {
      story = d;
      renderEdition(d);
      renderScenes(d);
      renderRail(d);
      route();
      renderFx();
    }).catch(function () {
      note('#today-story', 'Story unavailable.');
      note('#chapter-view', 'Story unavailable.');
      setText('#today-headline', 'Edition unavailable');
    });
    fetchJSON('data/pillars.json').then(function (d) {
      explainers = d.pillars || null;
      attachExplainers();
    }).catch(function () { /* explainers are optional */ });
    fetchJSON('data/engine.json').then(function (d) {
      renderEngine(d);
      renderPulse(d);
    }).catch(function () {
      note('#engine-rows', 'Macro engine data unavailable.');
      note('#today-pulse', 'Macro engine data unavailable.');
    });
    fetchJSON('data/banks.json').then(function (d) {
      renderBanks(d);
      (d.banks || []).forEach(function (b) { cal.banks[b.id] = b; });
      renderCalendar();
      renderFx();
    }).catch(function () {
      note('#bank-grid', 'Central bank data unavailable.');
    });
    initCalendar();
    initFx();
    fetchJSON('data/currencies.json').then(function (d) {
      fx.data = d;
      renderFx();
    }).catch(function () { note('#fx-board', 'Currency data unavailable.'); });
    fetchJSON('data/calendar.json').then(function (d) {
      cal.data = d;
      if (d.updated) setText('#cal-updated', fmtDateTime(d.updated, true));
      renderCalendar();
      renderFx();
    }).catch(function () {
      note('#cal-list', 'Calendar data unavailable.');
      note('#today-next', 'Calendar data unavailable.');
    });
    fetchJSON('data/latest.json').then(renderWire).catch(function () {
      note('#latest-items', 'No wire items.');
    });
  }

  /* Self-update: home-screen web apps and browser caches can keep serving an
     old index.html (and therefore old assets). Re-fetch the page from the
     network; if it references a newer asset version, reload once. */
  function checkFreshness() {
    if (!window.fetch) return;
    fetch('index.html', { cache: 'reload' }).then(function (r) {
      return r.ok ? r.text() : '';
    }).then(function (html) {
      var m = /assets\/app\.js\?v=([\w.-]+)/.exec(html);
      if (!m || m[1] === ASSET_VERSION) return;
      var key = 'gloment-reloaded-' + m[1];
      try {
        if (sessionStorage.getItem(key)) return; // already tried once
        sessionStorage.setItem(key, '1');
      } catch (e) { return; }
      location.reload();
    }).catch(function () { /* offline — keep the current page */ });
  }

  /* ---------------- helpers ---------------- */
  var loaded = {};   // path → raw text as rendered (see watchUpdates)
  function fetchJSON(path) {
    return fetch(path, {cache: 'no-store'}).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) {
      loaded[path] = t;
      return JSON.parse(t);
    });
  }

  /* Scheduled pushes (2 a.m. edition, 30-min wire, intraday actuals) land
     while the page sits open or a home-screen app waits in the background.
     Every few minutes while visible — and on returning to the page — re-fetch
     the data files and compare with what was rendered. Back after a long
     break: reload straight away. Mid-read: offer a refresh pill instead of
     yanking the page. */
  var CHECK_EVERY = 5 * 60 * 1000, AWAY_RELOAD = 10 * 60 * 1000;
  function watchUpdates() {
    var hiddenAt = 0;
    function check(autoReload) {
      var paths = Object.keys(loaded);
      if (!paths.length || !window.fetch) return;
      Promise.all(paths.map(function (p) {
        return fetch(p, { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : loaded[p]; })
          .catch(function () { return loaded[p]; });
      })).then(function (texts) {
        var changed = texts.some(function (t, i) { return t !== loaded[paths[i]]; });
        if (!changed) return;
        if (autoReload) location.reload();
        else showUpdatePill();
      });
    }
    setInterval(function () { if (!document.hidden) check(false); }, CHECK_EVERY);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      var away = hiddenAt ? Date.now() - hiddenAt : 0;
      checkFreshness();
      check(away >= AWAY_RELOAD);
    });
  }

  function showUpdatePill() {
    if ($('#update-pill')) return;
    var b = el('button', 'update-pill', 'New update · tap to refresh');
    b.id = 'update-pill';
    b.type = 'button';
    b.addEventListener('click', function () { location.reload(); });
    document.body.appendChild(b);
  }

  function $(sel) { return document.querySelector(sel); }

  function setText(sel, txt) {
    var n = $(sel);
    if (n) n.textContent = txt;
  }

  /* Small DOM helper — textContent only, no HTML injection. */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function note(sel, msg) {
    var t = $(sel);
    if (t) t.appendChild(el('p', 'meta', msg));
  }

  /* Only plain http(s) URLs become links; anything else renders as text. */
  function safeUrl(u) {
    try {
      var x = new URL(u);
      return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null;
    } catch (e) {
      return null;
    }
  }

  function extLink(label, href) {
    var a = el('a', null, label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  /* Normalise a source field to [{label, url}]. `source` may be a string,
     a {label, url} object, or an array of either; `url` links a single
     string source. */
  function sourceList(source, url) {
    var list = Array.isArray(source) ? source : [source];
    var out = [];
    list.forEach(function (s) {
      if (s == null || s === '') return;
      var label = typeof s === 'object' ? s.label : s;
      if (!label) return;
      var href = safeUrl(typeof s === 'object' ? s.url : (list.length === 1 ? url : null));
      out.push({ label: label, url: href });
    });
    return out;
  }

  /* Compact source chips: each linked source opens the article in a new tab. */
  function sourceChips(source, url) {
    var list = sourceList(source, url);
    var wrap = el('div', 'sources');
    wrap.appendChild(el('span', 'sources-lbl', list.length > 1 ? 'Sources' : 'Source'));
    if (!list.length) wrap.appendChild(el('span', 'chip muted', 'n/a'));
    list.forEach(function (s) {
      var chip;
      if (s.url) {
        chip = extLink(s.label, s.url);
        chip.className = 'chip';
        chip.title = 'Open on ' + new URL(s.url).hostname;
      } else {
        chip = el('span', 'chip muted', s.label);
      }
      wrap.appendChild(chip);
    });
    return wrap;
  }

  /* "2026-10-08T02:00:00-05:00" -> "Oct 8, 2:00 AM CT" */
  function fmtDateTime(iso, withYear) {
    try {
      var o = { timeZone: 'America/Chicago', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit' };
      if (withYear) o.year = 'numeric';
      return new Date(iso).toLocaleString('en-US', o) + ' CT';
    } catch (e) {
      return iso;
    }
  }

  function relTime(iso) {
    var mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (!isFinite(mins) || mins < 0) return fmtDateTime(iso);
    if (mins < 60) return mins + 'm ago';
    if (mins < 24 * 60) return Math.round(mins / 60) + 'h ago';
    return fmtDateTime(iso);
  }

  /* ---------------- theme menu (dropdown) ---------------- */
  function themeById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return null;
  }

  function swatchBg(t) {
    return 'linear-gradient(135deg, ' + t.sw[0] + ' 0 34%, ' + t.sw[1] + ' 34% 67%, ' + t.sw[2] + ' 67%)';
  }

  function initTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    if (!themeById(cur)) cur = 'alpine';

    var btn = $('#theme-btn'), list = $('#theme-list');
    if (!btn || !list) { applyTheme(cur, false); return; }

    // Build the menu: light themes, then dark.
    [['Light', false], ['Dark', true]].forEach(function (g) {
      var col = el('div', 'tl-col');
      col.appendChild(el('div', 'tl-group', g[0]));
      list.appendChild(col);
      THEMES.filter(function (t) { return !!t.dark === g[1]; }).forEach(function (t) {
        var item = el('button', 'tl-item');
        item.type = 'button';
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('data-theme-opt', t.id);
        var sw = el('span', 'tm-swatch');
        sw.style.background = swatchBg(t);
        item.appendChild(sw);
        var txt = el('span', 'tl-text');
        txt.appendChild(el('span', 'tl-name', t.name));
        txt.appendChild(el('span', 'tl-desc', t.desc));
        item.appendChild(txt);
        item.appendChild(el('span', 'tl-check', '\u2713'));
        col.appendChild(item);
      });
    });
    applyTheme(cur, false);

    function items() { return Array.prototype.slice.call(list.querySelectorAll('.tl-item')); }
    function open() {
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      var sel = list.querySelector('[aria-checked="true"]') || items()[0];
      if (sel) sel.focus();
    }
    function close(refocus) {
      if (list.hidden) return;
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus();
    }

    btn.addEventListener('click', function () { if (list.hidden) open(); else close(false); });
    list.addEventListener('click', function (e) {
      var it = e.target.closest('.tl-item');
      if (!it) return;
      applyTheme(it.getAttribute('data-theme-opt'), true);
      close(true);
    });
    list.addEventListener('keydown', function (e) {
      var all = items(), i = all.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var n = all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
        if (n) n.focus();
        e.preventDefault();
      } else if (e.key === 'Home' || e.key === 'End') {
        all[e.key === 'Home' ? 0 : all.length - 1].focus();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        close(true);
      } else if (e.key === 'Tab') {
        close(false);
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#theme-menu')) close(false);
    });
  }

  function applyTheme(id, save) {
    var t = themeById(id) || THEMES[0];
    document.documentElement.setAttribute('data-theme', t.id);
    var btn = $('#theme-btn');
    if (btn) {
      btn.setAttribute('aria-label', 'Color scheme: ' + t.name);
      btn.title = 'Color scheme: ' + t.name;
    }
    var sw = $('#theme-swatch');
    if (sw) sw.style.background = swatchBg(t);
    Array.prototype.forEach.call(document.querySelectorAll('.tl-item'), function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-theme-opt') === t.id ? 'true' : 'false');
    });
    if (save) {
      try { localStorage.setItem('gloment-theme', t.id); } catch (e) { /* private mode */ }
    }
  }

  /* ---------------- tabs / routing ---------------- */
  function initTabs() {
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    // Home links (wordmark, Today tab) go to the clean site URL, no #today.
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-home]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      if (location.hash) history.pushState(null, '', location.pathname + location.search);
      route();
    });
    var bar = $('#tabs');
    // Arrow-key navigation between tabs.
    bar.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var tabs = Array.prototype.slice.call(bar.querySelectorAll('[role=tab]'));
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
      e.preventDefault();
    });
    route();
  }

  function route() {
    var h = (location.hash || '#today').slice(1).split('/');
    var tab = TABS.indexOf(h[0]) >= 0 ? h[0] : 'today';
    TABS.forEach(function (t) {
      var v = $('#view-' + t), a = $('#tab-' + t);
      var on = t === tab;
      if (v) v.hidden = !on;
      if (a) {
        a.setAttribute('aria-selected', on ? 'true' : 'false');
        a.tabIndex = on ? 0 : -1;
      }
    });
    if (tab === 'story' && story) {
      var n = parseInt(h[1], 10);
      showChapter(isFinite(n) ? n - 1 : chapterIdx);
    }
    if (tab === 'fx') {
      fx.focus = (h[1] || '').toUpperCase();
      renderFx();
    }
    var active = $('#tab-' + tab);
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    window.scrollTo(0, 0);
  }

  /* ---------------- clock + sessions ---------------- */
  function startClock() {
    function tick() {
      var now = new Date();
      setText('#clock-utc', now.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
      }) + ' UTC');
      renderSessions(now);
    }
    tick();
    setInterval(tick, 30000);
  }

  /* FX sessions, each judged on its own city's clock so daylight-saving
     shifts are handled automatically (Intl time zones):
       Sydney 07:00–16:00, Tokyo 09:00–18:00, London 08:00–17:00,
       New York 08:00–17:00 — local time, Monday–Friday.
     On top of that the FX week runs Sunday 17:00 → Friday 17:00 New York
     time, so nothing shows open over the weekend. Holidays are not modelled. */
  var SESSIONS = [
    { code: 'SYD', city: 'Sydney',   tz: 'Australia/Sydney', open: 7 * 60, close: 16 * 60 },
    { code: 'TYO', city: 'Tokyo',    tz: 'Asia/Tokyo',       open: 9 * 60, close: 18 * 60 },
    { code: 'LDN', city: 'London',   tz: 'Europe/London',    open: 8 * 60, close: 17 * 60 },
    { code: 'NYC', city: 'New York', tz: 'America/New_York', open: 8 * 60, close: 17 * 60 }
  ];
  var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /* Weekday (0–6) and minutes after midnight in a given time zone. */
  function zoned(now, tz) {
    var parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).forEach(function (p) { parts[p.type] = p.value; });
    return { wd: WD[parts.weekday], mins: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10) };
  }

  function fxWeekOpen(now) {
    var ny = zoned(now, 'America/New_York');
    if (ny.wd === 6) return false;                       // Saturday
    if (ny.wd === 0) return ny.mins >= 17 * 60;          // Sunday from 17:00
    if (ny.wd === 5) return ny.mins < 17 * 60;           // Friday until 17:00
    return true;
  }

  /* Minutes until the FX week reopens (Sunday 17:00 New York). */
  function minsUntilMarketOpen(now) {
    var ny = zoned(now, 'America/New_York');
    var days = (7 - ny.wd) % 7;                          // to Sunday
    return days * 1440 + 17 * 60 - ny.mins;
  }

  function hm(mins) {
    if (mins >= 1440) return Math.floor(mins / 1440) + 'd ' + Math.floor((mins % 1440) / 60) + 'h';
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h ? h + 'h ' : '') + m + 'm';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Minutes until this session next opens (local weekdays only). */
  function minsUntilOpen(z, s) {
    for (var d = 0; d <= 7; d++) {
      var wd = (z.wd + d) % 7;
      if (wd === 0 || wd === 6) continue;
      if (d === 0 && z.mins >= s.open) continue;
      return d * 1440 + s.open - z.mins;
    }
    return null;
  }

  function renderSessions(now) {
    var box = $('#sessions');
    if (!box) return;
    var marketOpen = fxWeekOpen(now);
    box.textContent = '';
    SESSIONS.forEach(function (s) {
      var z = zoned(now, s.tz);
      var weekday = z.wd >= 1 && z.wd <= 5;
      var open = marketOpen && weekday && z.mins >= s.open && z.mins < s.close;
      var hours = pad2(s.open / 60) + ':00–' + pad2(s.close / 60) + ':00 local';
      var status;
      if (open) {
        status = 'open · closes in ' + hm(s.close - z.mins);
      } else {
        var wait = minsUntilOpen(z, s);
        // Over the weekend a session can't open before the FX week does.
        if (!marketOpen && wait != null) wait = Math.max(wait, minsUntilMarketOpen(now));
        status = (marketOpen ? 'closed' : 'closed — FX market shut for the weekend') +
          (wait != null ? ' · opens in ' + hm(wait) : '');
      }
      var chip = el('span', 'sess' + (open ? ' open' : ''), s.code);
      chip.title = s.city + ' ' + hours + ' — ' + status;
      chip.setAttribute('aria-label', s.city + ' session ' + status);
      box.appendChild(chip);
    });
  }

  /* ---------------- edition / today ---------------- */
  function renderEdition(d) {
    if (d.date) {
      var p = d.date.split('-');
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var label = months[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10) + ', ' + p[0];
      setText('#edition-date', label);
      setText('#hero-date', '· ' + label);
    }
    // Headline as word spans so it can rise in word by word.
    var h = $('#today-headline');
    h.textContent = '';
    (d.headline || 'Today’s edition').split(/\s+/).forEach(function (w, i) {
      if (i) h.appendChild(document.createTextNode(' '));
      var s = el('span', 'hw', w);
      s.style.setProperty('--i', i);
      h.appendChild(s);
    });
    var hc = $('#hero-chapters');
    hc.textContent = '';
    (d.chapters || []).forEach(function (ch, i) {
      var li = el('li');
      li.style.setProperty('--i', i);
      li.appendChild(el('span', 'mono', String(i + 1).padStart(2, '0')));
      li.appendChild(document.createTextNode(' ' + ch.title));
      hc.appendChild(li);
    });
  }

  /* Numbers inside a data point get emphasis (split + textContent, no HTML). */
  var NUM_RE = /([+\-−~]?[$¥€£]?\d+(?:[.,]\d+)*(?:[–-]\d+(?:[.,]\d+)*)?(?:\s?(?:%|bp|T|k|bn)\b|%)?)/;
  function withFigures(node, text) {
    String(text).split(NUM_RE).forEach(function (part, i) {
      if (!part) return;
      node.appendChild(i % 2 ? el('b', 'fig mono', part) : document.createTextNode(part));
    });
    return node;
  }

  /* One pinned scene per chapter. Each child with data-at reveals once the
     scene's scroll progress (0–1) passes that value: FX line, then each data
     point, then the meaning and the way into the full chapter. */
  function renderScenes(d) {
    var box = $('#today-story'), dots = $('#story-dots');
    box.textContent = '';
    dots.textContent = '';
    var chs = d.chapters || [];
    chs.forEach(function (ch, i) {
      var nums = ch.numbers || [];
      var steps = 2 + nums.length;   // FX line, each number, foot
      var at = function (k) { return (0.06 + 0.78 * k / (steps - 1)).toFixed(3); };
      var k = 0;

      var sc = el('section', 'scene ch-scene');
      sc.setAttribute('data-scene', '');
      sc.id = 'scene-' + (i + 1);
      sc.style.setProperty('--steps', steps);
      var pin = el('div', 'pin');
      pin.appendChild(el('span', 'ghost-num mono', String(i + 1).padStart(2, '0')));
      var inner = el('div', 'pin-inner ch-inner');

      var head = el('div', 'ch-head step');
      head.setAttribute('data-reveal', '');   // in as the scene arrives
      head.appendChild(el('p', 'kicker', 'Chapter ' + (i + 1) + ' of ' + chs.length));
      head.appendChild(el('h2', 'ch-title', ch.title));
      inner.appendChild(head);

      if (ch.fx) {
        var fxl = el('p', 'ch-fx step');
        fxl.setAttribute('data-at', at(k++));
        withFigures(fxl, ch.fx);
        inner.appendChild(fxl);
      } else k++;

      if (nums.length) {
        var ul = el('ul', 'ch-nums');
        nums.forEach(function (n) {
          var li = el('li', 'step');
          li.setAttribute('data-at', at(k++));
          withFigures(li, n);
          ul.appendChild(li);
        });
        inner.appendChild(ul);
      }

      var foot = el('div', 'ch-foot step');
      foot.setAttribute('data-at', at(Math.min(k, steps - 1)));
      if (ch.meaning) {
        var m = el('p', 'ch-meaning');
        m.appendChild(el('span', 'callout-lbl', 'What it means'));
        m.appendChild(el('span', null, ch.meaning));
        foot.appendChild(m);
      }
      var cta = el('a', 'btn', 'Read the full chapter →');
      cta.href = '#story/' + (i + 1);
      foot.appendChild(cta);
      inner.appendChild(foot);

      pin.appendChild(inner);
      sc.appendChild(pin);
      box.appendChild(sc);

      var dot = el('button', 'sdot');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Chapter ' + (i + 1) + ': ' + ch.title);
      dot.appendChild(el('span', 'sdot-lbl', ch.title));
      dot.addEventListener('click', function () { jumpTo(sc); });
      dots.appendChild(dot);
    });
    measureScenes();
    queueScroll();
  }

  /* ---------------- today: scroll engine ----------------
     Each [data-scene] is taller than the screen; its .pin sticks under the
     masthead while the scene scrolls past. Progress p (0 → 1) through that
     travel is written to --p (continuous effects in CSS) and flips .in on
     [data-at] steps (eased CSS transitions). [data-reveal] blocks fade up
     once they enter the viewport. Reduced motion: no pinning, all shown. */
  var sx = { raf: 0, mast: 0, reduced: false };

  function initScrollStory() {
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var setReduced = function () {
      sx.reduced = !!(mq && mq.matches);
      document.documentElement.classList.toggle('no-motion', sx.reduced);
      queueScroll();
    };
    setReduced();
    if (mq && mq.addEventListener) mq.addEventListener('change', setReduced);
    window.addEventListener('scroll', queueScroll, { passive: true });
    window.addEventListener('resize', function () { measureScenes(); queueScroll(); });
    window.addEventListener('hashchange', function () { setTimeout(function () { measureScenes(); queueScroll(); }, 0); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measureScenes(); queueScroll(); });
    measureScenes();
  }

  function queueScroll() {
    if (!sx.raf) sx.raf = requestAnimationFrame(updateScroll);
  }

  /* Masthead height (sticky offset) and, per scene, how far the pinned
     content overflows the screen — it then drifts up as you scroll. */
  function measureScenes() {
    var m = $('.masthead');
    sx.mast = m ? m.offsetHeight : 0;
    document.documentElement.style.setProperty('--mast-h', sx.mast + 'px');
    var v = $('#view-today');
    if (!v || v.hidden) return;
    Array.prototype.forEach.call(v.querySelectorAll('[data-scene]'), function (sc) {
      var pin = sc.querySelector('.pin'), inner = sc.querySelector('.pin-inner');
      if (!pin || !inner) return;
      var ov = Math.max(0, inner.offsetHeight - pin.clientHeight + 48);
      sc.style.setProperty('--ov', ov + 'px');
      sc.classList.toggle('tall', ov > 0);
    });
  }

  function updateScroll() {
    sx.raf = 0;
    var v = $('#view-today');
    if (!v || v.hidden) return;
    var vh = window.innerHeight, avail = vh - sx.mast;
    var scenes = v.querySelectorAll('[data-scene]');
    var reads = [], active = -1;
    Array.prototype.forEach.call(scenes, function (sc) {
      reads.push(sc.getBoundingClientRect());
    });
    Array.prototype.forEach.call(scenes, function (sc, i) {
      var r = reads[i], span = Math.max(1, r.height - avail);
      var p = sx.reduced ? 1 : Math.min(1, Math.max(0, (sx.mast - r.top) / span));
      sc.style.setProperty('--p', p.toFixed(4));
      Array.prototype.forEach.call(sc.querySelectorAll('[data-at]'), function (n) {
        n.classList.toggle('in', sx.reduced || p >= +n.getAttribute('data-at'));
      });
      if (sc.classList.contains('ch-scene') && r.top <= sx.mast + avail * 0.5) active = i - 1;
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-reveal]'), function (n) {
      if (sx.reduced || n.getBoundingClientRect().top < vh * 0.9) n.classList.add('in');
    });

    // Reading progress through the chapters, and the chapter dots.
    var story = $('#today-story'), bar = $('#read-bar');
    if (story && bar) {
      var sr = story.getBoundingClientRect();
      var prog = Math.min(1, Math.max(0, (sx.mast - sr.top) / Math.max(1, sr.height - avail)));
      bar.style.transform = 'scaleX(' + prog.toFixed(4) + ')';
      var inStory = sr.top < sx.mast + avail * 0.5 && sr.bottom > sx.mast + avail * 0.5;
      $('#story-dots').classList.toggle('on', inStory);
    }
    Array.prototype.forEach.call(document.querySelectorAll('#story-dots .sdot'), function (d, i) {
      if (i === active) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
  }

  /* Scroll so a chapter scene's content is fully revealed. */
  function jumpTo(sc) {
    var span = sc.offsetHeight - (window.innerHeight - sx.mast);
    var y = sc.getBoundingClientRect().top + window.pageYOffset - sx.mast + Math.max(0, span) * 0.86;
    window.scrollTo({ top: y, behavior: sx.reduced ? 'auto' : 'smooth' });
  }

  /* Macro pulse: pillar title + its one-line read. */
  function renderPulse(d) {
    var box = $('#today-pulse');
    (d.rows || []).forEach(function (row) {
      var li = el('li');
      li.appendChild(el('span', 'p-title', row.title));
      li.appendChild(el('span', 'p-read', row.read));
      box.appendChild(li);
    });
  }

  /* ---------------- story ---------------- */
  function renderRail(d) {
    var rail = $('#chapter-rail');
    (d.chapters || []).forEach(function (ch, i) {
      var li = el('li');
      var a = el('a');
      a.href = '#story/' + (i + 1);
      a.appendChild(el('span', 'r-num mono', String(i + 1).padStart(2, '0')));
      a.appendChild(el('span', 'r-title', ch.title));
      li.appendChild(a);
      rail.appendChild(li);
    });
  }

  function showChapter(i) {
    var chs = story.chapters || [];
    if (!chs.length) return;
    chapterIdx = Math.max(0, Math.min(chs.length - 1, i));
    var ch = chs[chapterIdx];

    Array.prototype.forEach.call(document.querySelectorAll('#chapter-rail a'), function (a, k) {
      if (k === chapterIdx) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });

    var v = $('#chapter-view');
    v.textContent = '';
    v.appendChild(el('p', 'kicker', 'Chapter ' + (chapterIdx + 1) + ' of ' + chs.length));
    v.appendChild(el('h1', 'display', ch.title));

    // The FX takeaway leads — it's the point of the chapter.
    var fx = el('div', 'fx-callout');
    fx.appendChild(el('span', 'callout-lbl', 'What it means for FX'));
    fx.appendChild(el('p', null, ch.fx));
    v.appendChild(fx);

    v.appendChild(el('p', 'lede', ch.meaning));

    if ((ch.numbers || []).length) {
      v.appendChild(el('h2', 'section-label', 'The numbers'));
      var ul = el('ul', 'numbers');
      ch.numbers.forEach(function (n) { ul.appendChild(el('li', null, n)); });
      v.appendChild(ul);
    }

    if (ch.scenarios) v.appendChild(scenarioSwitch(ch.scenarios));

    v.appendChild(sourceChips(ch.sources || ch.source, ch.source_url));

    // Prev / next
    var nav = el('div', 'chapter-nav');
    if (chapterIdx > 0) {
      var p = el('a', 'btn ghost', '← ' + chs[chapterIdx - 1].title);
      p.href = '#story/' + chapterIdx;
      nav.appendChild(p);
    } else {
      nav.appendChild(el('span'));
    }
    if (chapterIdx < chs.length - 1) {
      var n = el('a', 'btn', chs[chapterIdx + 1].title + ' →');
      n.href = '#story/' + (chapterIdx + 2);
      nav.appendChild(n);
    }
    v.appendChild(nav);
  }

  /* Base / Bull / Bear as a segmented control: one scenario visible at a time. */
  function scenarioSwitch(sc) {
    var box = el('div', 'scenarios');
    var head = el('div', 'sc-head');
    head.appendChild(el('h2', 'section-label', 'Scenarios'));
    var seg = el('div', 'segmented');
    seg.setAttribute('role', 'tablist');
    seg.setAttribute('aria-label', 'Scenario');
    head.appendChild(seg);
    box.appendChild(head);
    var body = el('p', 'sc-body');
    body.setAttribute('aria-live', 'polite');
    box.appendChild(body);

    var keys = [['base', 'Base'], ['bull', 'Bull'], ['bear', 'Bear']].filter(function (k) {
      return sc[k[0]];
    });
    function pick(key) {
      Array.prototype.forEach.call(seg.children, function (b) {
        b.setAttribute('aria-selected', b.getAttribute('data-k') === key ? 'true' : 'false');
      });
      body.className = 'sc-body sc-' + key;
      body.textContent = sc[key];
    }
    keys.forEach(function (k) {
      var b = el('button', 'seg sc-' + k[0], k[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-k', k[0]);
      b.addEventListener('click', function () { pick(k[0]); });
      seg.appendChild(b);
    });
    if (keys.length) pick(keys[0][0]);
    return box;
  }

  /* ---------------- macro engine ---------------- */
  var NUMWORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  var explainers = null;   // data/pillars.json, keyed by engine row id

  function renderEngine(d) {
    if (d.updated) setText('#engine-updated', fmtDateTime(d.updated, true));
    var rows = d.rows || [];
    setText('#pillar-count', NUMWORDS[rows.length] || String(rows.length));
    var box = $('#engine-rows');
    box.textContent = '';
    // 3-up grid with no orphans: a remainder of 1 turns the last four tiles
    // into two rows of halves (7 → 3+2+2); a remainder of 2 halves the last two.
    var n = rows.length, rem = n % 3;
    var halfFrom = rem === 1 && n >= 4 ? n - 4 : rem === 2 ? n - 2 : n;
    rows.forEach(function (row, i) {
      var c = el('div', 'card pillar' + (i >= halfFrom ? ' half' : ''));
      c.setAttribute('data-pillar', row.id);
      var head = el('div', 'pillar-head');
      head.appendChild(el('span', 'pillar-title', row.title));
      c.appendChild(head);
      c.appendChild(el('p', 'pillar-read', row.read));
      c.appendChild(el('p', 'pillar-figure mono', row.figure));
      c.appendChild(sourceChips(row.sources || row.source, row.source_url));
      box.appendChild(c);
    });
    attachExplainers();
  }

  /* "What is this?" toggle on each pillar that has an explainer. */
  function attachExplainers() {
    if (!explainers) return;
    Array.prototype.forEach.call(document.querySelectorAll('.pillar[data-pillar]'), function (c) {
      var x = explainers[c.getAttribute('data-pillar')];
      if (!x || c.querySelector('.explain-btn')) return;
      var id = 'explain-' + c.getAttribute('data-pillar');
      var btn = el('button', 'explain-btn');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', id);
      btn.appendChild(el('span', 'explain-i', 'i'));
      btn.appendChild(document.createTextNode('What is this?'));
      c.querySelector('.pillar-head').appendChild(btn);

      var panel = el('div', 'explain');
      panel.id = id;
      panel.hidden = true;
      panel.appendChild(el('p', null, x.body));
      if (x.live) {
        var live = el('div', 'explain-live');
        live.appendChild(el('span', 'callout-lbl', 'Live example'));
        live.appendChild(el('p', null, x.live));
        panel.appendChild(live);
      }
      c.insertBefore(panel, c.querySelector('.pillar-read'));
      btn.addEventListener('click', function () {
        var open = panel.hidden;
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        c.classList.toggle('explaining', open);
      });
    });
  }

  /* ---------------- central banks ----------------
     data/banks.json → one card per bank, soonest decision first. Banks with
     no data yet sink to the end as compact "not covered" cards. */
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function ymd(str) {               // "2026-10-27" -> local Date at midnight
    var p = (str || '').split('-');
    return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null;
  }

  function fmtMeeting(m) {
    var a = ymd(m.start), b = ymd(m.end);
    if (!a) return '';
    var out = MONTHS[a.getMonth()] + ' ' + a.getDate();
    if (b && +b !== +a) out += '–' + (b.getMonth() === a.getMonth() ? '' : MONTHS[b.getMonth()] + ' ') + b.getDate();
    return out;
  }

  /* Days from today to the meeting; null if it has passed. */
  function daysUntil(m) {
    var a = ymd(m.start), b = ymd(m.end) || a;
    if (!a) return null;
    var t = new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    if (b < t) return null;
    return Math.max(0, Math.round((a - t) / 864e5));
  }

  function inDays(n) {
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days';
  }

  function moveChip(mv) {
    if (!mv || mv.bp == null) return null;
    var d = ymd(mv.date), when = d ? ' · ' + MONTHS[d.getMonth()] + ' ' + d.getDate() : '';
    if (mv.bp > 0) return el('span', 'move up', 'Hiked +' + mv.bp + 'bp' + when);
    if (mv.bp < 0) return el('span', 'move dn', 'Cut ' + mv.bp + 'bp' + when);
    return el('span', 'move flat', 'Held' + when);
  }

  var BIAS = { hawkish: ['Hawkish', 'hawk'], dovish: ['Dovish', 'dove'], neutral: ['Neutral', 'neutral'] };

  function renderBanks(d) {
    if (d.updated) setText('#banks-updated', fmtDateTime(d.updated, true));
    var grid = $('#bank-grid');
    var banks = (d.banks || []).map(function (b) {
      var nm = b.next_meeting && b.next_meeting.start ? b.next_meeting : null;
      return { b: b, nm: nm, days: nm ? daysUntil(nm) : null, covered: !!(b.rate || b.priced || b.bias) };
    });
    // Covered first, then by soonest meeting; unknown dates last.
    banks.sort(function (x, y) {
      if (x.covered !== y.covered) return x.covered ? -1 : 1;
      var dx = x.days == null ? 1e9 : x.days, dy = y.days == null ? 1e9 : y.days;
      return dx - dy;
    });

    var thin = [];
    banks.forEach(function (o) {
      var b = o.b;
      var c = el('article', 'card bank' + (o.covered ? '' : ' thin'));
      var head = el('div', 'bank-head');
      head.appendChild(el('span', 'bank-short', b.short));
      head.appendChild(el('span', 'bank-ccy mono', b.ccy || ''));
      if (b.bias && BIAS[b.bias]) head.appendChild(el('span', 'bias ' + BIAS[b.bias][1], BIAS[b.bias][0]));
      c.appendChild(head);
      c.appendChild(el('p', 'bank-name', b.name));

      if (o.covered) {
        var rate = el('div', 'bank-rate');
        rate.appendChild(el('span', 'rate-val', b.rate || '—'));
        if (b.rate_label) rate.appendChild(el('span', 'rate-lbl', b.rate_label));
        c.appendChild(rate);
        var mc = moveChip(b.last_move);
        if (mc) c.appendChild(mc);
      }

      var meet = el('div', 'bank-meet');
      meet.appendChild(el('span', 'meet-lbl', 'Next decision'));
      if (o.nm) {
        var when = el('span', 'meet-when');
        when.appendChild(el('b', null, fmtMeeting(o.nm)));
        if (o.days != null) when.appendChild(el('span', 'meet-in', inDays(o.days)));
        meet.appendChild(when);
      } else {
        meet.appendChild(el('span', 'meet-when muted', 'Date to come'));
      }
      c.appendChild(meet);

      if (b.priced) {
        var pr = el('div', 'bank-priced');
        pr.appendChild(el('span', 'meet-lbl', 'Market pricing'));
        pr.appendChild(el('span', null, b.priced));
        c.appendChild(pr);
      }

      if (o.covered) {
        if ((b.sources || []).length) c.appendChild(sourceChips(b.sources));
      } else {
        thin.push(b.short);
      }
      grid.appendChild(c);
    });

    // Headline strip: the very next decision across all banks.
    var next = banks.filter(function (o) { return o.days != null; })
      .sort(function (x, y) { return x.days - y.days; })[0];
    var strip = $('#bank-next');
    if (next && strip) {
      strip.textContent = '';
      strip.appendChild(el('span', 'kicker', 'Next decision'));
      var line = el('p', 'bank-next-line');
      line.appendChild(el('b', null, next.b.name));
      line.appendChild(document.createTextNode(' · ' + fmtMeeting(next.nm) + ' · ' + inDays(next.days)));
      strip.appendChild(line);
      strip.hidden = false;
    }
    setText('#bank-foot', thin.length
      ? 'Rates and pricing for ' + thin.join(', ') + ' arrive as the data feed covers them.'
      : '');
  }

  /* ---------------- calendar ----------------
     data/calendar.json → filterable, time-zone-aware event list.
     Each event: ts (UTC ISO) or date + time_tbd; ccy; impact; title;
     actual/forecast/previous; better ("higher"/"lower" = good for the
     currency); why / if_beat / if_miss; chapter (story link); bank (joins
     banks.json); sources. Reader prefs persist in localStorage. */
  var CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
  var IMPACTS = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
  var TZS = [
    ['local', 'Local time'], ['America/Chicago', 'Chicago (CT)'], ['America/New_York', 'New York (ET)'],
    ['Europe/London', 'London'], ['Asia/Tokyo', 'Tokyo'], ['UTC', 'UTC']
  ];
  var cal = {
    data: null,
    banks: {},
    open: {},
    prefs: { range: 'week', impact: { high: true, medium: true, low: false }, ccy: [], tz: 'local' },
    timer: null
  };

  function makePips(level) {
    var p = el('span', 'pips pips-' + level);
    for (var i = 0; i < 3; i++) p.appendChild(el('i'));
    return p;
  }

  function loadCalPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem('gloment-cal') || 'null');
      if (p && typeof p === 'object') {
        if (p.range) cal.prefs.range = p.range;
        if (p.impact) cal.prefs.impact = p.impact;
        if (Array.isArray(p.ccy)) cal.prefs.ccy = p.ccy;
        if (p.tz) cal.prefs.tz = p.tz;
      }
    } catch (e) { /* defaults */ }
  }
  function saveCalPrefs() {
    try { localStorage.setItem('gloment-cal', JSON.stringify(cal.prefs)); } catch (e) { /* private mode */ }
  }

  function tzOpt() { return cal.prefs.tz === 'local' ? undefined : cal.prefs.tz; }

  function tzAbbr() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: tzOpt(), timeZoneName: 'short' }).formatToParts(new Date());
      for (var i = 0; i < parts.length; i++) if (parts[i].type === 'timeZoneName') return parts[i].value;
    } catch (e) {}
    return '';
  }

  /* "YYYY-MM-DD" of a Date in the chosen zone. */
  function dayKeyOf(date) {
    var parts = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: tzOpt(), year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    return parts.year + '-' + parts.month + '-' + parts.day;
  }
  function keyAdd(key, n) {
    var p = key.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  function keyDow(key) {
    var p = key.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
  }
  function keyLabel(key, todayKey) {
    var p = key.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var lbl = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
    if (key === todayKey) return 'Today · ' + lbl;
    if (key === keyAdd(todayKey, 1)) return 'Tomorrow · ' + lbl;
    if (key === keyAdd(todayKey, -1)) return 'Yesterday · ' + lbl;
    return lbl;
  }
  function fmtClock(date) {
    return date.toLocaleTimeString('en-US', { timeZone: tzOpt(), hour: 'numeric', minute: '2-digit' });
  }

  function evWhen(e) { return e.ts ? new Date(e.ts) : null; }
  function evKey(e) { var w = evWhen(e); return w ? dayKeyOf(w) : e.date; }
  /* Sort value: timed events by instant; date-only events at the start of their day. */
  function evSort(e) {
    var w = evWhen(e);
    if (w) return w.getTime();
    var p = (e.date || '').split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) - 1;
  }
  function evUpcoming(e, now, todayKey) {
    var w = evWhen(e);
    return w ? w.getTime() >= now.getTime() : (e.date >= todayKey);
  }

  function num(v) {
    if (v == null) return null;
    var n = parseFloat(String(v).replace(/[,%$¥€£\s]/g, '').replace(/[KMBT]$/i, ''));
    return isFinite(n) ? n : null;
  }
  /* 'good' | 'bad' | 'inline' | null — actual vs forecast, from the currency's view. */
  function surprise(e) {
    var a = num(e.actual), f = num(e.forecast);
    if (a == null || f == null || !e.better) return null;
    if (a === f) return 'inline';
    var up = a > f;
    return (e.better === 'higher' ? up : !up) ? 'good' : 'bad';
  }

  function countdown(ms) {
    if (ms <= 0) return 'now';
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + mm + 'm';
    var s = Math.floor((ms % 60000) / 1000);
    return mm + 'm ' + (s < 10 ? '0' : '') + s + 's';
  }

  function initCalendar() {
    loadCalPrefs();
    var sel = $('#cal-tz');
    if (sel) {
      TZS.forEach(function (t) {
        var o = el('option', null, t[1]);
        o.value = t[0];
        sel.appendChild(o);
      });
      sel.value = cal.prefs.tz;
      sel.addEventListener('change', function () { cal.prefs.tz = sel.value; saveCalPrefs(); renderCalendar(); });
    }
    var range = $('#cal-range');
    if (range) range.addEventListener('click', function (e) {
      var b = e.target.closest('[data-range]');
      if (!b) return;
      cal.prefs.range = b.getAttribute('data-range'); saveCalPrefs(); renderCalendar();
    });
    var imp = $('#cal-impact');
    if (imp) {
      IMPACTS.forEach(function (i) {
        var b = el('button', 'fchip imp-' + i[0]);
        b.type = 'button';
        b.setAttribute('data-impact', i[0]);
        b.appendChild(makePips(i[0]));
        b.appendChild(document.createTextNode(i[1]));
        imp.appendChild(b);
      });
      imp.addEventListener('click', function (e) {
        var b = e.target.closest('[data-impact]');
        if (!b) return;
        var k = b.getAttribute('data-impact');
        cal.prefs.impact[k] = !cal.prefs.impact[k]; saveCalPrefs(); renderCalendar();
      });
    }
    var cc = $('#cal-ccy');
    if (cc) {
      ['ALL'].concat(CCYS).forEach(function (c) {
        var b = el('button', 'fchip ccy', c === 'ALL' ? 'All' : c);
        b.type = 'button';
        b.setAttribute('data-ccy', c);
        cc.appendChild(b);
      });
      cc.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ccy]');
        if (!b) return;
        var c = b.getAttribute('data-ccy');
        if (c === 'ALL') cal.prefs.ccy = [];
        else {
          var i = cal.prefs.ccy.indexOf(c);
          if (i >= 0) cal.prefs.ccy.splice(i, 1); else cal.prefs.ccy.push(c);
          if (cal.prefs.ccy.length === CCYS.length) cal.prefs.ccy = [];
        }
        saveCalPrefs(); renderCalendar();
      });
    }
    var list = $('#cal-list');
    if (list) list.addEventListener('click', function (e) {
      var ics = e.target.closest('[data-ics]');
      if (ics) { downloadIcs(ics.getAttribute('data-ics')); return; }
      var row = e.target.closest('.ev-row');
      if (!row) return;
      var id = row.getAttribute('data-id');
      cal.open[id] = !cal.open[id];
      row.setAttribute('aria-expanded', cal.open[id] ? 'true' : 'false');
      var det = row.parentNode.querySelector('.ev-detail');
      if (det) det.hidden = !cal.open[id];
    });
    if (!cal.timer) cal.timer = setInterval(tickCalendar, 1000);
  }

  function filtered(now) {
    var evs = (cal.data && cal.data.events) || [];
    var todayKey = dayKeyOf(now);
    var monday = keyAdd(todayKey, -((keyDow(todayKey) + 6) % 7));
    var lo, hi;
    switch (cal.prefs.range) {
      case 'today': lo = hi = todayKey; break;
      case 'next': lo = keyAdd(monday, 7); hi = keyAdd(monday, 13); break;
      case 'past': lo = keyAdd(todayKey, -7); hi = todayKey; break;
      case 'all': lo = keyAdd(todayKey, -7) < monday ? keyAdd(todayKey, -7) : monday; hi = '9999-12-31'; break;
      default: lo = monday; hi = keyAdd(monday, 6);
    }
    return evs.filter(function (e) {
      var k = evKey(e);
      if (!k || k < lo || k > hi) return false;
      if (!cal.prefs.impact[e.impact]) return false;
      if (cal.prefs.ccy.length && cal.prefs.ccy.indexOf(e.ccy) < 0) return false;
      return true;
    }).sort(function (a, b) { return evSort(a) - evSort(b); });
  }

  function renderCalendar() {
    if (!cal.data) return;
    var now = new Date();
    var todayKey = dayKeyOf(now);

    // Controls reflect prefs.
    Array.prototype.forEach.call(document.querySelectorAll('#cal-range [data-range]'), function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-range') === cal.prefs.range ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#cal-impact [data-impact]'), function (b) {
      b.setAttribute('aria-pressed', cal.prefs.impact[b.getAttribute('data-impact')] ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#cal-ccy [data-ccy]'), function (b) {
      var c = b.getAttribute('data-ccy');
      var on = c === 'ALL' ? !cal.prefs.ccy.length : cal.prefs.ccy.indexOf(c) >= 0;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var sel = $('#cal-tz');
    if (sel && sel.options.length) sel.options[0].textContent = 'Local time (' + (cal.prefs.tz === 'local' ? tzAbbr() : 'device') + ')';

    renderNextUp(now, todayKey);
    renderUpNext(now);

    var list = $('#cal-list');
    list.textContent = '';
    var evs = filtered(now);
    if (!evs.length) {
      var empty = el('div', 'card cal-empty');
      empty.appendChild(el('p', null, 'No events match these filters.'));
      list.appendChild(empty);
      return;
    }
    var bar = el('div', 'cal-bar');
    bar.appendChild(el('span', 'meta', evs.length + (evs.length === 1 ? ' event' : ' events') + ' · times in ' + tzAbbr()));
    var ex = el('button', 'btn ghost small', 'Add these to my calendar');
    ex.type = 'button';
    ex.setAttribute('data-ics', '__visible');
    bar.appendChild(ex);
    list.appendChild(bar);

    var group = null, groupKey = null, nowDrawn = false;
    evs.forEach(function (e) {
      var k = evKey(e);
      if (k !== groupKey) {
        groupKey = k;
        group = el('section', 'cal-day card' + (k === todayKey ? ' today' : '') + (k < todayKey ? ' past' : ''));
        group.appendChild(el('h3', 'cal-day-head', keyLabel(k, todayKey)));
        list.appendChild(group);
      }
      if (k === todayKey && !nowDrawn && evUpcoming(e, now, todayKey) && evWhen(e)) {
        var nl = el('div', 'now-line');
        nl.appendChild(el('span', null, 'Now · ' + fmtClock(now)));
        group.appendChild(nl);
        nowDrawn = true;
      }
      group.appendChild(eventRow(e, now, todayKey));
    });
    // Today's events all done: put "Now" at the end of today's list.
    var todayGroup = list.querySelector('.cal-day.today');
    if (todayGroup && !nowDrawn) {
      var end = el('div', 'now-line');
      end.appendChild(el('span', null, 'Now \u00b7 ' + fmtClock(now)));
      todayGroup.appendChild(end);
    }
  }

  function eventRow(e, now, todayKey) {
    var w = evWhen(e), up = evUpcoming(e, now, todayKey), sp = surprise(e);
    var wrap = el('div', 'ev imp-' + e.impact + (up ? '' : ' past'));
    var row = el('button', 'ev-row');
    row.type = 'button';
    row.setAttribute('data-id', e.id);
    row.setAttribute('aria-expanded', cal.open[e.id] ? 'true' : 'false');

    row.appendChild(el('span', 'ev-time mono', w && !e.time_tbd ? fmtClock(w) : 'TBD'));
    row.appendChild(el('span', 'ev-ccy mono', e.ccy));
    var pips = makePips(e.impact);
    pips.title = e.impact.charAt(0).toUpperCase() + e.impact.slice(1) + ' impact';
    row.appendChild(pips);

    var t = el('span', 'ev-title');
    t.appendChild(el('span', 'ev-name', e.title));
    if (!up && e.outcome) t.appendChild(el('span', 'ev-outcome', e.outcome));
    if (up && w) {
      var cd = el('span', 'ev-cd', 'in ' + countdown(w - now));
      cd.setAttribute('data-ts', w.getTime());
      t.appendChild(cd);
    }
    row.appendChild(t);

    function cell(lbl, v, cls) {
      var c = el('span', 'ev-num');
      c.appendChild(el('small', null, lbl));
      c.appendChild(el('b', 'mono' + (cls ? ' ' + cls : ''), v == null || v === '' ? '—' : v));
      return c;
    }
    var nums = el('span', 'ev-nums');
    nums.appendChild(cell('Actual', e.actual, sp ? 'sp-' + sp : null));
    nums.appendChild(cell('Forecast', e.forecast));
    nums.appendChild(cell('Previous', e.previous));
    row.appendChild(nums);
    row.appendChild(el('span', 'ev-caret', '›'));
    wrap.appendChild(row);

    var det = el('div', 'ev-detail');
    det.hidden = !cal.open[e.id];
    if (sp && sp !== 'inline') {
      det.appendChild(el('p', 'sp-note sp-' + sp, (sp === 'good' ? 'Beat' : 'Missed') + ' forecast — ' +
        (sp === 'good' ? 'supportive' : 'negative') + ' for ' + e.ccy));
    }
    if (e.outcome && !up) {
      var oc = el('div', 'ev-outcome-box');
      oc.appendChild(el('span', 'callout-lbl', 'What it meant'));
      oc.appendChild(el('p', null, e.outcome));
      det.appendChild(oc);
    }
    if (e.why) det.appendChild(el('p', 'ev-why', e.why));
    if (e.if_beat || e.if_miss) {
      var cb = e.category === 'central-bank';
      var g = el('div', 'ev-scen');
      if (e.if_beat) {
        var b1 = el('div', 'sc-box sc-bull');
        b1.appendChild(el('span', 'callout-lbl', cb ? 'Hawkish outcome' : 'If it beats'));
        b1.appendChild(el('p', null, e.if_beat));
        g.appendChild(b1);
      }
      if (e.if_miss) {
        var b2 = el('div', 'sc-box sc-bear');
        b2.appendChild(el('span', 'callout-lbl', cb ? 'Dovish outcome' : 'If it misses'));
        b2.appendChild(el('p', null, e.if_miss));
        g.appendChild(b2);
      }
      det.appendChild(g);
    }
    var bk = e.bank && cal.banks[e.bank];
    if (bk) {
      var bx = el('div', 'ev-bank');
      bx.appendChild(el('span', 'callout-lbl', bk.short + ' today'));
      var bits = [];
      if (bk.rate) bits.push(bk.rate + (bk.rate_label ? ' ' + bk.rate_label.toLowerCase() : ''));
      if (bk.last_move && bk.last_move.bp != null) {
        var lm = ymd(bk.last_move.date);
        bits.push((bk.last_move.bp > 0 ? 'hiked +' + bk.last_move.bp + 'bp' : bk.last_move.bp < 0 ? 'cut ' + bk.last_move.bp + 'bp' : 'held') +
          (lm ? ' ' + MONTHS[lm.getMonth()] + ' ' + lm.getDate() : ''));
      }
      if (bk.priced) bits.push('priced: ' + bk.priced);
      if (bk.bias) bits.push(bk.bias);
      bx.appendChild(el('p', null, bits.join(' · ')));
      det.appendChild(bx);
    }
    var links = el('div', 'ev-links');
    if (e.chapter) {
      var ch = el('a', 'more', 'Read the story chapter →');
      ch.href = '#story/' + e.chapter;
      links.appendChild(ch);
    }
    if (bk) {
      var bl = el('a', 'more', 'Central bank card →');
      bl.href = '#banks';
      links.appendChild(bl);
    }
    var add = el('button', 'btn ghost small', 'Add to calendar');
    add.type = 'button';
    add.setAttribute('data-ics', e.id);
    links.appendChild(add);
    det.appendChild(links);
    if ((e.sources || []).length) det.appendChild(sourceChips(e.sources));
    if (!e.why && !e.if_beat && !bk && !(e.sources || []).length) {
      det.insertBefore(el('p', 'meta', 'No briefing for this event yet.'), det.firstChild);
    }
    wrap.appendChild(det);
    return wrap;
  }

  /* "Up next": the next high-impact event, with a live countdown. */
  function renderUpNext(now) {
    var box = $('#cal-next');
    if (!box || !cal.data) return;
    var todayKey = dayKeyOf(now);
    var evs = (cal.data.events || []).filter(function (e) {
      return e.impact === 'high' && evWhen(e) && evUpcoming(e, now, todayKey);
    }).sort(function (a, b) { return evSort(a) - evSort(b); });
    var e = evs[0];
    if (!e) { box.hidden = true; return; }
    var w = evWhen(e);
    box.textContent = '';
    var left = el('div', 'cn-main');
    left.appendChild(el('span', 'kicker', 'Up next · high impact'));
    var h = el('p', 'cn-title');
    h.appendChild(el('span', 'ev-ccy mono', e.ccy));
    h.appendChild(document.createTextNode(' ' + e.title));
    left.appendChild(h);
    var k = dayKeyOf(w);
    left.appendChild(el('p', 'meta', keyLabel(k, todayKey) + ' · ' + fmtClock(w) + ' ' + tzAbbr() +
      (e.forecast ? ' · forecast ' + e.forecast : '') + (e.previous ? ' · previous ' + e.previous : '')));
    box.appendChild(left);
    var cd = el('div', 'cn-count mono', countdown(w - now));
    cd.setAttribute('data-ts', w.getTime());
    box.appendChild(cd);
    box.hidden = false;
  }

  /* Today tab "Next up": next three high/medium events. */
  function renderNextUp(now, todayKey) {
    var box = $('#today-next');
    if (!box) return;
    box.textContent = '';
    var evs = ((cal.data && cal.data.events) || []).filter(function (e) {
      return e.impact !== 'low' && evUpcoming(e, now, todayKey);
    }).sort(function (a, b) { return evSort(a) - evSort(b); }).slice(0, 3);
    if (!evs.length) { box.appendChild(el('li', 'meta', 'Nothing scheduled.')); return; }
    evs.forEach(function (e) {
      var w = evWhen(e), k = evKey(e), p = k.split('-');
      var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      var row = el('li', e.impact === 'high' ? 'key' : null);
      row.appendChild(el('span', 'n-day mono', d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })));
      var what = el('span', 'n-what', e.ccy + ' · ' + e.title);
      if (w && !e.time_tbd) what.appendChild(el('small', 'n-time', fmtClock(w)));
      row.appendChild(what);
      box.appendChild(row);
    });
  }

  /* Live countdowns; full re-render when an event crosses "now". */
  function tickCalendar() {
    var now = Date.now(), crossed = false;
    Array.prototype.forEach.call(document.querySelectorAll('[data-ts]'), function (n) {
      var ms = +n.getAttribute('data-ts') - now;
      if (ms <= 0) crossed = true;
      n.textContent = (n.classList.contains('ev-cd') ? 'in ' : '') + countdown(ms);
    });
    if (crossed) renderCalendar();
  }

  /* ---- .ics export (one event, or everything currently visible) ---- */
  function icsEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n'); }
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function icsEvent(e) {
    var w = evWhen(e), L = ['BEGIN:VEVENT', 'UID:' + e.id + '@gloment', 'DTSTAMP:' + icsStamp(new Date())];
    if (w && !e.time_tbd) {
      L.push('DTSTART:' + icsStamp(w), 'DURATION:PT30M');
    } else {
      var k = evKey(e);
      L.push('DTSTART;VALUE=DATE:' + k.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + keyAdd(k, 1).replace(/-/g, ''));
    }
    L.push('SUMMARY:' + icsEsc(e.ccy + ' · ' + e.title));
    var desc = [e.why, e.forecast ? 'Forecast ' + e.forecast : '', e.previous ? 'Previous ' + e.previous : '']
      .filter(Boolean).join('\n');
    if (desc) L.push('DESCRIPTION:' + icsEsc(desc));
    if (w && !e.time_tbd) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.title), 'TRIGGER:-PT15M', 'END:VALARM');
    L.push('END:VEVENT');
    return L.join('\r\n');
  }
  function downloadIcs(which) {
    var evs = (cal.data && cal.data.events) || [];
    var pick = which === '__visible' ? filtered(new Date()) : evs.filter(function (e) { return e.id === which; });
    if (!pick.length) return;
    var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gloment//Calendar//EN', 'CALSCALE:GREGORIAN']
      .concat(pick.map(icsEvent)).concat(['END:VCALENDAR']).join('\r\n');
    var blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (which === '__visible' ? 'gloment-calendar' : which) + '.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------- currencies ----------------
     data/currencies.json → strength board (sum of pillar scores), currency
     detail (#fx/AUD: breakdown, trend, story, bank, events, best crosses) and
     a pair picker that ranks counterparts by divergence. Carry comes from
     banks.json, event risk from calendar.json. */
  var PILLARS = [
    ['policy', 'Policy'], ['growth', 'Growth'], ['inflation', 'Inflation'], ['risk', 'Risk sentiment'],
    ['tot', 'Terms of trade'], ['positioning', 'Positioning'], ['fiscal', 'Fiscal & sovereign']
  ];
  /* Market quoting convention: the higher-priority currency is the base. */
  var PRIORITY = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
  var fx = { data: null, focus: '', dir: 'bull', ccy: 'AUD' };

  function initFx() {
    try {
      var p = JSON.parse(localStorage.getItem('gloment-fx') || 'null');
      if (p && p.dir) fx.dir = p.dir;
      if (p && p.ccy) fx.ccy = p.ccy;
    } catch (e) { /* defaults */ }
    var dir = $('#fx-dir');
    if (dir) dir.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dir]');
      if (b) { fx.dir = b.getAttribute('data-dir'); saveFx(); renderPicker(); }
    });
    var cc = $('#fx-ccy');
    if (cc) {
      CCYS.forEach(function (c) {
        var b = el('button', 'fchip ccy', c);
        b.type = 'button';
        b.setAttribute('data-ccy', c);
        cc.appendChild(b);
      });
      cc.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ccy]');
        if (b) { fx.ccy = b.getAttribute('data-ccy'); saveFx(); renderPicker(); }
      });
    }
    // "Express it" shortcuts from a currency page preset the picker.
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-express]');
      if (!a) return;
      var v = a.getAttribute('data-express').split(':');
      fx.dir = v[0]; fx.ccy = v[1]; saveFx();
    });
  }
  function saveFx() {
    try { localStorage.setItem('gloment-fx', JSON.stringify({ dir: fx.dir, ccy: fx.ccy })); } catch (e) {}
  }

  function fxList() { return (fx.data && fx.data.currencies) || []; }
  function fxGet(c) {
    var l = fxList();
    for (var i = 0; i < l.length; i++) if (l[i].ccy === c) return l[i];
    return null;
  }
  function fxScore(c) {
    var d = (c && c.drivers) || {}, t = 0;
    Object.keys(d).forEach(function (k) { t += +d[k].score || 0; });
    return t;
  }
  function fxRanked() {
    return fxList().slice().sort(function (a, b) {
      return fxScore(b) - fxScore(a) || PRIORITY.indexOf(a.ccy) - PRIORITY.indexOf(b.ccy);
    });
  }
  /* Score history for one currency, oldest first; today's live score appended
     if the feed's history doesn't include this edition yet. */
  function fxHistory(c) {
    var h = ((fx.data && fx.data.history) || []).filter(function (x) { return x.scores && x.scores[c.ccy] != null; })
      .map(function (x) { return { date: x.date, v: +x.scores[c.ccy] }; });
    var asOf = fx.data.as_of;
    if (!h.length || h[h.length - 1].date !== asOf) h.push({ date: asOf || 'today', v: fxScore(c) });
    return h;
  }
  function fxDelta(c) {
    var h = fxHistory(c);
    return h.length > 1 ? h[h.length - 1].v - h[h.length - 2].v : null;
  }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }

  function rateNum(bankId) {
    var b = cal.banks[bankId];
    if (!b || !b.rate) return null;
    var m = String(b.rate).match(/-?\d+(\.\d+)?/g);
    if (!m) return null;
    var v = m.map(Number);
    return v.length > 1 ? (v[0] + v[1]) / 2 : v[0];
  }

  /* Upcoming high-impact events for a set of currencies within N days. */
  function eventsFor(ccys, days) {
    var now = new Date(), lim = now.getTime() + days * 864e5;
    var todayKey = dayKeyOf(now);
    return ((cal.data && cal.data.events) || []).filter(function (e) {
      if (e.impact !== 'high' || ccys.indexOf(e.ccy) < 0 || !evUpcoming(e, now, todayKey)) return false;
      var w = evWhen(e);
      return w ? w.getTime() <= lim : true;
    }).sort(function (a, b) { return evSort(a) - evSort(b); });
  }

  /* Rank the 7 crosses for a view, e.g. bullish AUD. */
  function fxPicks(dir, X) {
    var x = fxGet(X);
    if (!x) return [];
    var sx = fxScore(x);
    return fxList().filter(function (y) { return y.ccy !== X; }).map(function (y) {
      var sy = fxScore(y);
      var gap = dir === 'bull' ? sx - sy : sy - sx;
      var base = PRIORITY.indexOf(X) < PRIORITY.indexOf(y.ccy) ? X : y.ccy;
      var quote = base === X ? y.ccy : X;
      var longBase = dir === 'bull' ? base === X : base === y.ccy;
      var rx = rateNum(x.bank), ry = rateNum(y.bank);
      var carry = rx == null || ry == null ? null : (dir === 'bull' ? rx - ry : ry - rx);
      return {
        y: y, sy: sy, gap: gap, pair: base + '/' + quote, action: longBase ? 'Buy' : 'Sell', carry: carry,
        rating: gap >= 2 ? ['Best', 'best'] : gap === 1 ? ['Good', 'good'] : gap === 0 ? ['No edge', 'flat'] : ['Avoid', 'avoid'],
        events: eventsFor([X, y.ccy], 14)
      };
    }).sort(function (a, b) { return b.gap - a.gap || (b.carry || 0) - (a.carry || 0); });
  }

  /* Why this counterpart: its drivers pointing the useful way. */
  function pickWhy(p, dir) {
    var want = dir === 'bull' ? -1 : 1;      // bullish X wants a weak counterpart
    var d = p.y.drivers || {};
    var notes = PILLARS.filter(function (k) { return d[k[0]] && Math.sign(d[k[0]].score) === want; })
      .map(function (k) { return d[k[0]].note; });
    if (p.gap < 0) return p.y.ccy + ' is ' + (dir === 'bull' ? 'stronger' : 'weaker') + ' on the board (' + signed(p.sy) + ') — this cross fights your view.';
    if (notes.length) return notes.slice(0, 2).join(' · ');
    return p.y.summary || '';
  }

  function diverging(score, max) {
    var bar = el('span', 'dbar');
    bar.setAttribute('aria-hidden', 'true');
    var fill = el('i', score >= 0 ? 'pos' : 'neg');
    fill.style.width = (Math.min(Math.abs(score), max) / max * 50) + '%';
    bar.appendChild(fill);
    return bar;
  }

  function renderFx() {
    if (!fx.data) return;
    setText('#fx-asof', fx.data.as_of || '—');
    setText('#fx-method', fx.data.method || '');
    var ranked = fxRanked();
    var max = Math.max(4, Math.max.apply(null, ranked.map(function (c) { return Math.abs(fxScore(c)); })));

    var board = $('#fx-board');
    board.textContent = '';
    ranked.forEach(function (c, i) {
      var li = el('li');
      var a = el('a', 'board-row' + (fx.focus === c.ccy ? ' on' : ''));
      a.href = '#fx/' + c.ccy;
      a.appendChild(el('span', 'b-rank mono', String(i + 1)));
      var id = el('span', 'b-id');
      id.appendChild(el('b', 'mono', c.ccy));
      id.appendChild(el('small', null, c.name));
      a.appendChild(id);
      a.appendChild(diverging(fxScore(c), max));
      a.appendChild(el('span', 'b-score mono', signed(fxScore(c))));
      var dl = fxDelta(c);
      a.appendChild(el('span', 'b-delta mono' + (dl > 0 ? ' up' : dl < 0 ? ' dn' : ''),
        dl == null ? '' : dl === 0 ? '=' : (dl > 0 ? '▲' : '▼') + Math.abs(dl)));
      a.appendChild(el('span', 'b-sum', c.summary || ''));
      li.appendChild(a);
      board.appendChild(li);
    });

    renderFxDetail(ranked, max);
    renderPicker();
  }

  function renderPicker() {
    if (!fx.data) return;
    Array.prototype.forEach.call(document.querySelectorAll('#fx-dir [data-dir]'), function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-dir') === fx.dir ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#fx-ccy [data-ccy]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-ccy') === fx.ccy ? 'true' : 'false');
    });
    var x = fxGet(fx.ccy);
    setText('#fx-sub', x ? (fx.dir === 'bull' ? 'Bullish ' : 'Bearish ') + fx.ccy + ' (' + signed(fxScore(x)) +
      ' on the board): crosses ranked by how far the other side sits ' + (fx.dir === 'bull' ? 'below' : 'above') + ' it.' : '');
    var box = $('#fx-picks');
    box.textContent = '';
    fxPicks(fx.dir, fx.ccy).forEach(function (p) {
      var li = el('li', 'pick ' + p.rating[1]);
      var top = el('div', 'pick-top');
      top.appendChild(el('span', 'pick-act ' + (p.action === 'Buy' ? 'buy' : 'sell'), p.action));
      top.appendChild(el('b', 'pick-pair mono', p.pair));
      top.appendChild(el('span', 'pick-rate ' + p.rating[1], p.rating[0]));
      var gap = el('span', 'pick-gap mono', 'gap ' + signed(p.gap));
      gap.title = 'Score divergence between the two sides';
      top.appendChild(gap);
      li.appendChild(top);
      li.appendChild(el('p', 'pick-why', pickWhy(p, fx.dir)));
      var meta = [];
      if (p.carry != null) meta.push('carry ' + (p.carry >= 0 ? '+' : '−') + Math.abs(p.carry).toFixed(2) + '%' + (p.carry >= 0 ? ' (you earn)' : ' (you pay)'));
      if (p.events.length) {
        var e0 = p.events[0], w0 = evWhen(e0);
        meta.push(p.events.length + ' high-impact in 14d — next ' + e0.ccy + ' ' + e0.title +
          (w0 ? ' ' + MONTHS[new Date(w0).getMonth()] + ' ' + new Date(w0).getDate() : ''));
      }
      if (meta.length) li.appendChild(el('p', 'meta pick-meta', meta.join(' · ')));
      box.appendChild(li);
    });
  }

  function renderFxDetail(ranked, max) {
    var box = $('#fx-detail');
    var c = fxGet(fx.focus);
    if (!c) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.textContent = '';
    var card = el('article', 'card fx-detail');

    var back = el('a', 'more', '← All currencies');
    back.href = '#fx';
    card.appendChild(back);

    var head = el('div', 'fd-head');
    var t = el('div');
    t.appendChild(el('p', 'kicker', '#' + (ranked.indexOf(c) + 1) + ' of ' + ranked.length + ' on the board'));
    var h = el('h1', 'display');
    h.appendChild(el('span', 'mono fd-code', c.ccy));
    h.appendChild(document.createTextNode(' ' + c.name));
    t.appendChild(h);
    if (c.summary) t.appendChild(el('p', 'lede', c.summary));
    head.appendChild(t);
    var sc = el('div', 'fd-score');
    sc.appendChild(el('span', 'fd-num mono', signed(fxScore(c))));
    var dl = fxDelta(c);
    sc.appendChild(el('span', 'meta', dl == null ? 'score' : 'score · ' + (dl === 0 ? 'unchanged' : signed(dl)) + ' vs prior edition'));
    head.appendChild(sc);
    card.appendChild(head);

    var cols = el('div', 'fd-cols');

    // Breakdown by pillar
    var bd = el('section', 'fd-break');
    bd.appendChild(el('h2', 'section-label', 'What’s driving it'));
    var ul = el('ul', 'drivers');
    PILLARS.forEach(function (k) {
      var d = (c.drivers || {})[k[0]];
      var s = d ? +d.score || 0 : 0;
      var li = el('li', s > 0 ? 'pos' : s < 0 ? 'neg' : 'zero');
      var a = el('a', 'dr-name', k[1]);
      a.href = '#engine';
      li.appendChild(a);
      li.appendChild(el('span', 'dr-score mono', s === 0 ? '0' : signed(s)));
      li.appendChild(el('span', 'dr-note', d && d.note ? d.note : 'Not a driver today'));
      ul.appendChild(li);
    });
    bd.appendChild(ul);
    cols.appendChild(bd);

    var side = el('section', 'fd-side');
    // Trend
    side.appendChild(el('h2', 'section-label', 'Trend'));
    side.appendChild(sparkline(fxHistory(c)));
    // Story chapter
    if (c.chapter && story && story.chapters && story.chapters[c.chapter - 1]) {
      var sl = el('a', 'fd-story');
      sl.href = '#story/' + c.chapter;
      sl.appendChild(el('span', 'callout-lbl', 'The story behind it'));
      sl.appendChild(el('span', null, story.chapters[c.chapter - 1].title + ' →'));
      side.appendChild(sl);
    }
    // Central bank
    var bk = cal.banks[c.bank];
    if (bk) {
      var bx = el('a', 'fd-bank');
      bx.href = '#banks';
      bx.appendChild(el('span', 'callout-lbl', bk.short));
      bx.appendChild(el('span', null, (bk.rate || '') + (bk.bias ? ' · ' + bk.bias : '') +
        (bk.next_meeting ? ' · next ' + fmtMeeting(bk.next_meeting) : '')));
      side.appendChild(bx);
    }
    // Events
    var evs = eventsFor([c.ccy], 45);
    side.appendChild(el('h2', 'section-label', 'Next high-impact events'));
    var el2 = el('ul', 'fd-events');
    if (!evs.length) el2.appendChild(el('li', 'meta', 'None in the next 6 weeks.'));
    evs.slice(0, 4).forEach(function (e) {
      var w = evWhen(e), li = el('li');
      li.appendChild(el('span', 'mono', w ? MONTHS[w.getMonth()] + ' ' + w.getDate() : e.date));
      li.appendChild(el('span', null, e.title));
      el2.appendChild(li);
    });
    side.appendChild(el2);
    // Wire threads touching this currency
    var wt = wireThreads.filter(function (t) { return t.ccy.indexOf(c.ccy) >= 0; });
    if (wt.length) {
      side.appendChild(el('h2', 'section-label', 'On the wire'));
      wt.slice(0, 3).forEach(function (t) {
        var a = el('a', 'fd-wire');
        a.href = '#wire';
        a.appendChild(el('span', 'callout-lbl', relTime(t.latest.ts) + (t.items.length > 1 ? ' · ' + t.items.length + ' updates' : '')));
        a.appendChild(el('span', null, t.latest.headline));
        side.appendChild(a);
      });
    }
    // Express it
    side.appendChild(el('h2', 'section-label', 'Express it'));
    [['bull', 'Bullish'], ['bear', 'Bearish']].forEach(function (d) {
      var picks = fxPicks(d[0], c.ccy).filter(function (p) { return p.gap > 0; }).slice(0, 3);
      var row = el('p', 'fd-express');
      var lk = el('a', null, d[1] + ' ' + c.ccy + ':');
      lk.href = '#fx';
      lk.setAttribute('data-express', d[0] + ':' + c.ccy);
      row.appendChild(lk);
      row.appendChild(document.createTextNode(' ' + (picks.length
        ? picks.map(function (p) { return p.action.toLowerCase() + ' ' + p.pair; }).join(', ')
        : 'no cross with an edge today')));
      side.appendChild(row);
    });
    cols.appendChild(side);
    card.appendChild(cols);
    box.appendChild(card);
  }

  /* Score trend over editions; needs at least two points to draw. */
  function sparkline(h) {
    var wrap = el('div', 'spark');
    if (h.length < 2) {
      wrap.appendChild(el('p', 'meta', 'Trend builds from the next edition — one point so far (' + signed(h[0].v) + ').'));
      return wrap;
    }
    var W = 260, H = 64, pad = 6, lo = -4, hi = 4;
    h.forEach(function (p) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); });
    var xs = function (i) { return pad + i * (W - 2 * pad) / (h.length - 1); };
    var ys = function (v) { return pad + (hi - v) * (H - 2 * pad) / (hi - lo); };
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'spark-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Score trend: ' + h.map(function (p) { return p.date + ' ' + signed(p.v); }).join(', '));
    var zero = document.createElementNS(NS, 'line');
    zero.setAttribute('x1', pad); zero.setAttribute('x2', W - pad);
    zero.setAttribute('y1', ys(0)); zero.setAttribute('y2', ys(0));
    zero.setAttribute('class', 'spark-zero');
    svg.appendChild(zero);
    var line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', h.map(function (p, i) { return xs(i) + ',' + ys(p.v); }).join(' '));
    line.setAttribute('class', 'spark-line');
    svg.appendChild(line);
    h.forEach(function (p, i) {
      var g = document.createElementNS(NS, 'circle');
      g.setAttribute('cx', xs(i)); g.setAttribute('cy', ys(p.v));
      g.setAttribute('r', i === h.length - 1 ? 4 : 8);
      g.setAttribute('class', i === h.length - 1 ? 'spark-end' : 'spark-hit');
      var tt = document.createElementNS(NS, 'title');
      tt.textContent = p.date + ': ' + signed(p.v);
      g.appendChild(tt);
      svg.appendChild(g);
    });
    wrap.appendChild(svg);
    var first = h[0], last = h[h.length - 1];
    wrap.appendChild(el('p', 'meta', h.length + ' editions · ' + signed(first.v) + ' → ' + signed(last.v)));
    return wrap;
  }

  /* ---------------- breaking wire ----------------
     Bullets prefixed "Numbers:", "Meaning:", "FX:" are split into labelled
     parts. The FX line shows by default; the rest sits behind "Full detail". */
  function splitBullet(b) {
    var m = /^\s*(Numbers|Meaning|FX)\s*:\s*/i.exec(b);
    return m ? { key: m[1].toLowerCase(), text: b.slice(m[0].length) } : { key: null, text: b };
  }

  /* Group wire items into threads (same `thread` id = one developing
     story); items without a thread stand alone. Newest thread first. */
  var wireThreads = [];
  function buildThreads(items) {
    var map = {}, out = [];
    items.forEach(function (it, i) {
      var key = it.thread || ('solo-' + i);
      if (!map[key]) { map[key] = { id: key, items: [] }; out.push(map[key]); }
      map[key].items.push(it);
    });
    out.forEach(function (t) {
      t.items.sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
      t.latest = t.items[0];
      t.first = t.items[t.items.length - 1];
      var cc = [];
      t.items.forEach(function (it) {
        (it.ccy || []).forEach(function (c) { if (cc.indexOf(c) < 0) cc.push(c); });
      });
      t.ccy = cc;
      t.pillar = t.latest.pillar || null;
      t.next = t.latest.next || null;
    });
    return out.sort(function (a, b) { return new Date(b.latest.ts) - new Date(a.latest.ts); });
  }

  function pillarName(id) {
    for (var i = 0; i < PILLARS.length; i++) if (PILLARS[i][0] === id) return PILLARS[i][1];
    return id;
  }

  function fxPart(it) {
    var parts = (it.bullets || []).map(splitBullet);
    var f = parts.filter(function (p) { return p.key === 'fx'; })[0];
    return { fx: f, rest: parts.filter(function (p) { return p !== f; }) };
  }

  function detailBlock(rest, label) {
    var det = el('details', 'more-detail');
    det.appendChild(el('summary', null, label || 'Full detail'));
    rest.forEach(function (p) {
      var para = el('p');
      if (p.key) para.appendChild(el('span', 'lbl', p.key === 'numbers' ? 'Numbers' : p.key === 'fx' ? 'FX' : 'Meaning'));
      para.appendChild(document.createTextNode(p.text));
      det.appendChild(para);
    });
    return det;
  }

  function renderWire(d) {
    var box = $('#latest-items');
    box.textContent = '';
    var items = (d.items || []).slice();
    if (!items.length) {
      box.appendChild(el('p', 'meta', 'Nothing breaking right now.'));
      return;
    }
    var threads = buildThreads(items);
    wireThreads = threads;
    var badge = $('#wire-count');
    if (badge) { badge.textContent = threads.length; badge.hidden = false; }

    threads.forEach(function (t, i) {
      var it = t.latest, n = t.items.length;
      var w = el('article', 'card wire-item thread' + (i === 0 ? ' latest' : ''));
      w.id = 'thread-' + t.id;

      // Meta: live status, update count, time span
      var meta = el('div', 'wire-meta');
      if (i === 0) meta.appendChild(el('span', 'live-pill', n > 1 ? 'Developing' : 'Latest'));
      else if (n > 1) meta.appendChild(el('span', 'thread-pill', 'Developing'));
      var ts = el('time', 'mono', relTime(it.ts));
      ts.dateTime = it.ts;
      ts.title = fmtDateTime(it.ts, true);
      meta.appendChild(ts);
      if (n > 1) meta.appendChild(el('span', null, '· ' + n + ' updates since ' + fmtDateTime(t.first.ts)));
      w.appendChild(meta);

      var h = el('h3', 'wire-headline');
      var hu = safeUrl(it.url);
      if (hu) h.appendChild(extLink(it.headline, hu)); else h.textContent = it.headline;
      w.appendChild(h);

      // Tags: affected currencies (→ currency page) and pillar (→ engine)
      if (t.ccy.length || t.pillar) {
        var tags = el('div', 'wire-tags');
        t.ccy.forEach(function (c) {
          var a = el('a', 'tag ccy mono', c);
          a.href = '#fx/' + c;
          a.title = c + ' on the strength board';
          tags.appendChild(a);
        });
        if (t.pillar) {
          var pa = el('a', 'tag pillar', pillarName(t.pillar));
          pa.href = '#engine';
          tags.appendChild(pa);
        }
        w.appendChild(tags);
      }

      var parts = fxPart(it);
      if (parts.fx) {
        var fx = el('div', 'fx-callout small');
        fx.appendChild(el('span', 'callout-lbl', 'FX'));
        fx.appendChild(el('p', null, parts.fx.text));
        w.appendChild(fx);
      }
      if (t.next) {
        var nx = el('div', 'wire-next');
        nx.appendChild(el('span', 'callout-lbl', 'What’s next'));
        var nt = t.next.replace(/^Next:\s*/i, '');
        nx.appendChild(el('p', null, nt.charAt(0).toUpperCase() + nt.slice(1)));
        w.appendChild(nx);
      }
      if (parts.rest.length) w.appendChild(detailBlock(parts.rest));
      w.appendChild(sourceChips(it.sources || []));

      // The arc: earlier updates in this thread, newest first
      if (n > 1) {
        var arc = el('div', 'thread-arc');
        arc.appendChild(el('h4', 'section-label', 'How it developed'));
        var ol = el('ol', 'arc');
        t.items.forEach(function (u, k) {
          var li = el('li', k === 0 ? 'now' : null);
          var when = el('time', 'mono', fmtDateTime(u.ts));
          when.dateTime = u.ts;
          li.appendChild(when);
          var body = el('div', 'arc-body');
          body.appendChild(el('p', 'arc-hl', u.headline));
          if (k > 0) {
            var pp = fxPart(u);
            if (pp.fx) body.appendChild(el('p', 'arc-fx', 'FX: ' + pp.fx.text));
            var rest = pp.rest;
            if (rest.length || (u.sources || []).length) {
              var det = detailBlock(rest, 'Detail');
              if ((u.sources || []).length) det.appendChild(sourceChips(u.sources));
              body.appendChild(det);
            }
          } else {
            body.appendChild(el('p', 'arc-fx meta', 'Latest — above'));
          }
          li.appendChild(body);
          ol.appendChild(li);
        });
        arc.appendChild(ol);
        w.appendChild(arc);
      }
      box.appendChild(w);
    });

    // Teaser on the Today tab.
    var t0 = threads[0], tz = $('#today-wire');
    if (tz) {
      tz.textContent = '';
      tz.appendChild(el('span', 'live-pill', 'Wire · ' + relTime(t0.latest.ts)));
      var hl = el('span', 'teaser-hl', t0.latest.headline);
      if (t0.items.length > 1) hl.appendChild(el('small', 'teaser-n', ' · ' + t0.items.length + ' updates'));
      tz.appendChild(hl);
      tz.appendChild(el('span', 'tk-cta', 'Open →'));
      tz.hidden = false;
    }
    renderFx();
  }

})();
