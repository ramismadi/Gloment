/* Gloment — client-side renderer. Plain static JS, no build step.
   On load: live FX quotes from open.er-api.com, plus edition data
   (macro engine, story, latest) from local JSON files. */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    renderQuotes();
    fetchJSON('data/engine.json').then(renderEngine).catch(function () {
      note('#engine-rows', 'Macro engine data unavailable.');
    });
    fetchJSON('data/story.json').then(renderStory).catch(function () {
      note('#story-chapters', 'Story unavailable.');
    });
    fetchJSON('data/latest.json').then(renderLatest).catch(function () {
      note('#latest-items', 'No latest items.');
    });
  }

  function fetchJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* Small DOM helper — textContent only, no HTML injection. */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function note(sel, msg) {
    var t = document.querySelector(sel);
    if (t) t.appendChild(el('p', 'meta', msg));
  }

  function srcLabel(source) {
    return el('span', 'src', 'src: ' + source);
  }

  /* ---------------- live quotes ----------------
     open.er-api.com returns USD-based rates (1 USD = X currency).
     Crosses are derived arithmetically. */
  var PAIRS = [
    { sym: 'EUR/USD', dp: 4, calc: function (r) { return 1 / r.EUR; } },
    { sym: 'GBP/USD', dp: 4, calc: function (r) { return 1 / r.GBP; } },
    { sym: 'USD/JPY', dp: 2, calc: function (r) { return r.JPY; } },
    { sym: 'USD/CHF', dp: 4, calc: function (r) { return r.CHF; } },
    { sym: 'AUD/USD', dp: 4, calc: function (r) { return 1 / r.AUD; } },
    { sym: 'USD/CAD', dp: 4, calc: function (r) { return r.CAD; } },
    { sym: 'NZD/USD', dp: 4, calc: function (r) { return 1 / r.NZD; } },
    { sym: 'EUR/GBP', dp: 4, calc: function (r) { return r.GBP / r.EUR; } },
    { sym: 'EUR/JPY', dp: 2, calc: function (r) { return r.JPY / r.EUR; } },
    { sym: 'GBP/JPY', dp: 2, calc: function (r) { return r.JPY / r.GBP; } }
  ];

  function renderQuotes() {
    var strip = document.querySelector('#quotes-strip');
    var meta = document.querySelector('#quotes-meta');
    var dot = document.querySelector('#live-dot');

    fetch('https://open.er-api.com/v6/latest/USD')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (data.result !== 'success' || !data.rates) throw new Error('bad payload');
        strip.textContent = '';
        PAIRS.forEach(function (p) {
          var v = p.calc(data.rates);
          if (!isFinite(v)) return;
          var tile = el('div', 'quote');
          tile.appendChild(el('div', 'q-sym', p.sym));
          tile.appendChild(el('div', 'q-val', v.toFixed(p.dp)));
          strip.appendChild(tile);
        });
        dot.classList.add('on');
        var when = new Date(data.time_last_update_utc * 1000);
        meta.textContent = 'Live · updated ' + when.toUTCString() + ' · source: open.er-api.com';
      })
      .catch(function () {
        strip.textContent = '';
        strip.appendChild(el('p', 'meta',
          'Live quotes unavailable right now — the edition snapshot in the sections below still applies.'));
        meta.textContent = 'source: open.er-api.com (unreachable)';
      });
  }

  /* ---------------- macro engine ---------------- */
  function renderEngine(d) {
    var upd = document.querySelector('#engine-updated');
    if (d.updated) upd.textContent = fmtDateTime(d.updated);
    var box = document.querySelector('#engine-rows');
    (d.rows || []).forEach(function (row) {
      var r = el('div', 'engine-row');
      var head = el('div', 'engine-head');
      head.appendChild(el('span', 'engine-title', row.title));
      head.appendChild(srcLabel(row.source || 'n/a'));
      r.appendChild(head);
      r.appendChild(el('p', 'engine-figure', row.figure));
      r.appendChild(el('p', 'engine-read', row.read));
      box.appendChild(r);
    });
  }

  /* ---------------- story ---------------- */
  function renderStory(d) {
    // Edition date shown in the header, e.g. "2026-10-08" -> "October 8, 2026".
    if (d.date) {
      var parts = d.date.split('-');
      var months = ['January','February','March','April','May','June','July',
                    'August','September','October','November','December'];
      document.querySelector('#edition-date').textContent =
        months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
    }
    if (d.headline) {
      document.querySelector('#story-headline').textContent = d.headline;
    }
    var box = document.querySelector('#story-chapters');
    (d.chapters || []).forEach(function (ch) {
      var c = el('div', 'chapter');
      c.appendChild(el('h3', null, ch.title));

      var nums = el('ul', null);
      (ch.numbers || []).forEach(function (n) { nums.appendChild(el('li', null, n)); });
      c.appendChild(nums);

      var pm = el('p', null);
      pm.appendChild(el('span', 'lbl', 'Meaning — '));
      pm.appendChild(document.createTextNode(ch.meaning));
      c.appendChild(pm);

      var pf = el('p', null);
      pf.appendChild(el('span', 'lbl', 'FX — '));
      pf.appendChild(document.createTextNode(ch.fx));
      c.appendChild(pf);

      if (ch.scenarios) {
        var sc = el('ul', 'scenarios');
        [['base', 'Base'], ['bull', 'Bull'], ['bear', 'Bear']].forEach(function (k) {
          if (!ch.scenarios[k[0]]) return;
          var li = el('li', null);
          li.appendChild(el('span', 'sc-lbl', k[1]));
          li.appendChild(document.createTextNode(ch.scenarios[k[0]]));
          sc.appendChild(li);
        });
        c.appendChild(sc);
      }

      c.appendChild(srcLabel(ch.source || 'n/a'));
      box.appendChild(c);
    });
  }

  /* ---------------- latest (breaking) ---------------- */
  function renderLatest(d) {
    var box = document.querySelector('#latest-items');
    var items = (d.items || []).slice().sort(function (a, b) {
      return new Date(b.ts) - new Date(a.ts); // reverse-chronological
    });
    if (!items.length) {
      box.appendChild(el('p', 'meta', 'Nothing breaking right now.'));
      return;
    }
    items.forEach(function (it) {
      var w = el('div', 'latest-item');
      w.appendChild(el('div', 'latest-ts', fmtDateTime(it.ts)));
      w.appendChild(el('div', 'latest-headline', it.headline));
      var ul = el('ul', null);
      (it.bullets || []).forEach(function (b) { ul.appendChild(el('li', null, b)); });
      w.appendChild(ul);
      var s = (it.sources || []).join(', ') || 'n/a';
      w.appendChild(srcLabel(s));
      box.appendChild(w);
    });
  }

  /* "2026-10-08T02:00:00-05:00" -> "Oct 8, 2026, 2:00 AM CT" */
  function fmtDateTime(iso) {
    try {
      return new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
      }) + ' CT';
    } catch (e) {
      return iso;
    }
  }
})();
