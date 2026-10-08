/* Gloment — premium desk renderer. Plain static JS, no build step.
   Tabbed views (hash-routed: #today, #story, #story/2, #engine, #banks,
   #calendar, #wire), a theme picker, and edition data (story, macro engine,
   wire) from local JSON files. textContent-only DOM, no HTML injection. */

(function () {
  'use strict';

  /* Must equal the ?v= on app.js in index.html — bump both together. */
  var ASSET_VERSION = '9';

  var TABS = ['today', 'story', 'engine', 'banks', 'calendar', 'wire'];
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
    { id: 'midnight',  name: 'Midnight',  desc: 'Dark navy & sky',        sw: ['#0d1320', '#7cbcf0', '#d9b56a'], dark: true },
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
    initTheme();
    initTabs();
    startClock();
    renderNextUp();

    fetchJSON('data/story.json').then(function (d) {
      story = d;
      renderEdition(d);
      renderTakeaways(d);
      renderRail(d);
      route();
    }).catch(function () {
      note('#today-takeaways', 'Story unavailable.');
      note('#chapter-view', 'Story unavailable.');
      setText('#today-headline', 'Edition unavailable');
    });
    fetchJSON('data/engine.json').then(function (d) {
      renderEngine(d);
      renderPulse(d);
    }).catch(function () {
      note('#engine-rows', 'Macro engine data unavailable.');
      note('#today-pulse', 'Macro engine data unavailable.');
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
  function fetchJSON(path) {
    return fetch(path, {cache: 'no-store'}).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
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
    setInterval(tick, 15000);
  }

  /* FX sessions from UTC hour. Tokyo 00–09, London 08–17, New York 13–22.
     Weekends: market closed. */
  function renderSessions(now) {
    var box = $('#sessions');
    if (!box) return;
    var h = now.getUTCHours() + now.getUTCMinutes() / 60;
    var d = now.getUTCDay();
    var weekend = (d === 0 || d === 6);
    var defs = [
      { code: 'TYO', open: !weekend && h >= 0 && h < 9 },
      { code: 'LDN', open: !weekend && h >= 8 && h < 17 },
      { code: 'NYC', open: !weekend && h >= 13 && h < 22 }
    ];
    box.textContent = '';
    defs.forEach(function (s) {
      var chip = el('span', 'sess' + (s.open ? ' open' : ''), s.code);
      chip.title = weekend ? 'Weekend — FX market closed'
        : (s.code + ' session ' + (s.open ? 'open' : 'closed'));
      box.appendChild(chip);
    });
  }

  /* ---------------- edition / today ---------------- */
  function renderEdition(d) {
    if (d.date) {
      var p = d.date.split('-');
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      setText('#edition-date', months[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10) + ', ' + p[0]);
    }
    setText('#today-headline', d.headline || 'Today’s edition');
  }

  /* One card per chapter: title + the FX line. Click → that chapter. */
  function renderTakeaways(d) {
    var box = $('#today-takeaways');
    (d.chapters || []).forEach(function (ch, i) {
      var a = el('a', 'takeaway card');
      a.href = '#story/' + (i + 1);
      a.appendChild(el('span', 'tk-num mono', String(i + 1).padStart(2, '0')));
      a.appendChild(el('h3', 'tk-title', ch.title));
      a.appendChild(el('p', 'tk-fx', ch.fx));
      a.appendChild(el('span', 'tk-cta', 'Read the chapter →'));
      box.appendChild(a);
    });
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

  /* Next up: the first three calendar entries, marked key ones first-class. */
  function renderNextUp() {
    var box = $('#today-next');
    var items = document.querySelectorAll('#cal-list > li');
    Array.prototype.slice.call(items, 0, 3).forEach(function (li) {
      var row = el('li', li.hasAttribute('data-key') ? 'key' : null);
      row.appendChild(el('span', 'n-day mono', li.querySelector('.t-day').textContent));
      row.appendChild(el('span', 'n-what', li.querySelector('b').textContent));
      box.appendChild(row);
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
  function renderEngine(d) {
    if (d.updated) setText('#engine-updated', fmtDateTime(d.updated, true));
    var box = $('#engine-rows');
    (d.rows || []).forEach(function (row) {
      var c = el('div', 'card pillar');
      c.appendChild(el('span', 'pillar-title', row.title));
      c.appendChild(el('p', 'pillar-read', row.read));
      c.appendChild(el('p', 'pillar-figure mono', row.figure));
      c.appendChild(sourceChips(row.sources || row.source, row.source_url));
      box.appendChild(c);
    });
  }

  /* ---------------- breaking wire ----------------
     Bullets prefixed "Numbers:", "Meaning:", "FX:" are split into labelled
     parts. The FX line shows by default; the rest sits behind "Full detail". */
  function splitBullet(b) {
    var m = /^\s*(Numbers|Meaning|FX)\s*:\s*/i.exec(b);
    return m ? { key: m[1].toLowerCase(), text: b.slice(m[0].length) } : { key: null, text: b };
  }

  function renderWire(d) {
    var box = $('#latest-items');
    var items = (d.items || []).slice().sort(function (a, b) {
      return new Date(b.ts) - new Date(a.ts); // reverse-chronological
    });
    if (!items.length) {
      box.appendChild(el('p', 'meta', 'Nothing breaking right now.'));
      return;
    }
    var badge = $('#wire-count');
    if (badge) { badge.textContent = items.length; badge.hidden = false; }

    items.forEach(function (it, i) {
      var parts = (it.bullets || []).map(splitBullet);
      var fxPart = parts.filter(function (p) { return p.key === 'fx'; })[0];
      var rest = parts.filter(function (p) { return p !== fxPart; });

      var w = el('article', 'card wire-item' + (i === 0 ? ' latest' : ''));
      var meta = el('div', 'wire-meta');
      if (i === 0) meta.appendChild(el('span', 'live-pill', 'Latest'));
      var ts = el('time', 'mono', relTime(it.ts));
      ts.dateTime = it.ts;
      ts.title = fmtDateTime(it.ts, true);
      meta.appendChild(ts);
      w.appendChild(meta);

      var h = el('h3', 'wire-headline');
      var hu = safeUrl(it.url);
      if (hu) h.appendChild(extLink(it.headline, hu)); else h.textContent = it.headline;
      w.appendChild(h);

      if (fxPart) {
        var fx = el('div', 'fx-callout small');
        fx.appendChild(el('span', 'callout-lbl', 'FX'));
        fx.appendChild(el('p', null, fxPart.text));
        w.appendChild(fx);
      }

      if (rest.length) {
        var det = el('details', 'more-detail');
        det.appendChild(el('summary', null, 'Full detail'));
        rest.forEach(function (p) {
          var para = el('p');
          if (p.key) para.appendChild(el('span', 'lbl', p.key === 'numbers' ? 'Numbers' : 'Meaning'));
          para.appendChild(document.createTextNode(p.text));
          det.appendChild(para);
        });
        w.appendChild(det);
      }

      w.appendChild(sourceChips(it.sources || []));
      box.appendChild(w);
    });

    // Teaser on the Today tab.
    var t = $('#today-wire');
    if (t) {
      t.textContent = '';
      t.appendChild(el('span', 'live-pill', 'Wire · ' + relTime(items[0].ts)));
      t.appendChild(el('span', 'teaser-hl', items[0].headline));
      t.appendChild(el('span', 'tk-cta', 'Open →'));
      t.hidden = false;
    }
  }
})();
