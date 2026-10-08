/* Gloment — pro terminal desk renderer. Plain static JS, no build step.
   On load: status-bar clocks + FX session indicator, live FX quotes from
   open.er-api.com (with day-change vs previous ECB fixing from
   api.frankfurter.app), ticker tape, and edition data (macro engine, story,
   wire) from local JSON files. textContent-only DOM, no HTML injection. */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    startClocks();
    renderQuotes();
    fetchJSON('data/engine.json').then(renderEngine).catch(function () {
      note('#engine-rows', 'Macro engine data unavailable.');
    });
    fetchJSON('data/story.json').then(renderStory).catch(function () {
      note('#story-chapters', 'Story unavailable.');
    });
    fetchJSON('data/latest.json').then(renderWire).catch(function () {
      note('#latest-items', 'No wire items.');
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

  /* ---------------- status bar: clocks + sessions ---------------- */
  function startClocks() {
    function tick() {
      var now = new Date();
      var lc = document.querySelector('#clock-local');
      var uc = document.querySelector('#clock-utc');
      if (lc) {
        lc.textContent = now.toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZoneName: 'short'
        });
      }
      if (uc) {
        uc.textContent = now.toLocaleTimeString('en-GB', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZone: 'UTC'
        }) + ' UTC';
      }
      renderSessions(now);
    }
    tick();
    setInterval(tick, 1000);
  }

  /* FX sessions from UTC hour. Tokyo 00–09, London 08–17, New York 13–22.
     Weekends: market closed. */
  function renderSessions(now) {
    var box = document.querySelector('#sessions');
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
      var chip = el('span', 'sess' + (s.open ? ' open' : ''));
      chip.appendChild(el('span', 'dot'));
      chip.appendChild(document.createTextNode(s.code + ' ' + (s.open ? 'OPEN' : 'SHUT')));
      chip.title = weekend ? 'Weekend — FX market closed' : (s.open ? 'Session open' : 'Session closed');
      box.appendChild(chip);
    });
  }

  /* ---------------- live quotes ----------------
     open.er-api.com returns USD-based rates (1 USD = X currency).
     Crosses are derived arithmetically. Day-change % comes from the
     previous ECB fixing via api.frankfurter.app (labeled as such). */
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
    var board = document.querySelector('#quotes-board');
    var meta = document.querySelector('#quotes-meta');
    var dot = document.querySelector('#live-dot');

    fetch('https://open.er-api.com/v6/latest/USD')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (data.result !== 'success' || !data.rates) throw new Error('bad payload');
        board.textContent = '';
        var rows = [];
        PAIRS.forEach(function (p) {
          var v = p.calc(data.rates);
          if (!isFinite(v)) return;
          var row = el('div', 'qrow');
          row.appendChild(el('div', 'q-sym', p.sym));
          row.appendChild(el('div', 'q-val', v.toFixed(p.dp)));
          var chg = el('div', 'q-chg na', '—');
          row.appendChild(chg);
          board.appendChild(row);
          rows.push({ sym: p.sym, dp: p.dp, val: v, chgEl: chg });
        });
        dot.classList.add('on');
        var when = new Date(data.time_last_update_utc * 1000);
        meta.textContent = 'Live · updated ' + when.toUTCString() + ' · source: open.er-api.com';
        buildTicker(rows, null);
        // Day-change vs previous ECB fixing (best effort; labeled).
        dayChange().then(function (dc) {
          rows.forEach(function (r) {
            var c = dc.chg[r.sym];
            if (c == null || !isFinite(c)) return;
            r.chgEl.textContent = (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
            r.chgEl.className = 'q-chg ' + (c >= 0 ? 'up' : 'dn');
            r.chgEl.title = 'vs previous ECB fixing (' + dc.asof + ')';
            r.pct = c;
          });
          meta.textContent += ' · Δ vs prev ECB fixing ' + dc.asof;
          buildTicker(rows, dc);
        }).catch(function () { /* chg stays "—" */ });
      })
      .catch(function () {
        board.textContent = '';
        board.appendChild(el('p', 'meta',
          'Live quotes unavailable right now — the edition snapshot in the sections below still applies.'));
        meta.textContent = 'source: open.er-api.com (unreachable)';
        var tape = document.querySelector('.ticker');
        if (tape) tape.style.display = 'none';
      });
  }

  /* % change between the last two ECB fixing days, per pair. */
  function dayChange() {
    function f(d) { return d.toISOString().slice(0, 10); }
    var end = new Date(), start = new Date(Date.now() - 6 * 864e5);
    var url = 'https://api.frankfurter.app/v1/' + f(start) + '..' + f(end) +
              '?base=USD&symbols=EUR,GBP,JPY,CHF,AUD,CAD,NZD';
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      var days = Object.keys(d.rates || {}).sort();
      if (days.length < 2) throw new Error('insufficient history');
      var a = d.rates[days[days.length - 2]], b = d.rates[days[days.length - 1]];
      var out = {};
      PAIRS.forEach(function (p) {
        var va = p.calc(a), vb = p.calc(b);
        if (isFinite(va) && isFinite(vb) && va) out[p.sym] = (vb - va) / va * 100;
      });
      return { chg: out, asof: days[days.length - 1] };
    });
  }

  /* Scrolling ticker tape: two identical halves for a seamless CSS loop. */
  function buildTicker(rows, dc) {
    var track = document.querySelector('#ticker-track');
    if (!track || !rows.length) return;
    track.textContent = '';
    for (var k = 0; k < 2; k++) {
      rows.forEach(function (r) {
        var t = el('span', 'tick');
        t.appendChild(el('span', 't-sym', r.sym));
        t.appendChild(document.createTextNode(r.val.toFixed(r.dp) + ' '));
        if (r.pct != null && isFinite(r.pct)) {
          var c = el('span', 't-chg ' + (r.pct >= 0 ? 'up' : 'dn'),
            (r.pct >= 0 ? '▲' : '▼') + Math.abs(r.pct).toFixed(2) + '%');
          t.appendChild(c);
        }
        track.appendChild(t);
      });
    }
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

  /* ---------------- breaking wire ---------------- */
  function renderWire(d) {
    var box = document.querySelector('#latest-items');
    var items = (d.items || []).slice().sort(function (a, b) {
      return new Date(b.ts) - new Date(a.ts); // reverse-chronological
    });
    if (!items.length) {
      box.appendChild(el('p', 'meta', 'Nothing breaking right now.'));
      return;
    }
    items.forEach(function (it) {
      var w = el('div', 'wire-item');
      w.appendChild(el('div', 'wire-ts', fmtDateTime(it.ts)));
      var body = el('div', null);
      body.appendChild(el('div', 'wire-headline', it.headline));
      var ul = el('ul', null);
      (it.bullets || []).forEach(function (b) { ul.appendChild(el('li', null, b)); });
      body.appendChild(ul);
      var s = (it.sources || []).join(', ') || 'n/a';
      body.appendChild(srcLabel(s));
      w.appendChild(body);
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
