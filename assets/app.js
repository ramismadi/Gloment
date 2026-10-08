/* Gloment — pro terminal desk renderer. Plain static JS, no build step.
   On load: status-bar clocks + FX session indicator, and edition data
   (macro engine, story, wire) from local JSON files. textContent-only DOM,
   no HTML injection. */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    startClocks();
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

  /* Only plain http(s) URLs become links; anything else renders as text. */
  function safeUrl(u) {
    try {
      var x = new URL(u);
      return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null;
    } catch (e) {
      return null;
    }
  }

  /* Source label. `source` may be a string, a {label, url} object, or an
     array of either; `url` is an optional link for a single string source.
     Linked sources open the original article in a new tab. */
  function srcLabel(source, url) {
    var list = Array.isArray(source) ? source : [source];
    var wrap = el('span', 'src');
    wrap.appendChild(document.createTextNode('src: '));
    var shown = 0;
    list.forEach(function (s) {
      if (s == null || s === '') return;
      var label = typeof s === 'object' ? s.label : s;
      var href = safeUrl(typeof s === 'object' ? s.url : (list.length === 1 ? url : null));
      if (!label) return;
      if (shown++) wrap.appendChild(document.createTextNode(', '));
      if (href) {
        var a = el('a', null, label);
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.title = 'Open source: ' + new URL(href).hostname;
        wrap.appendChild(a);
      } else {
        wrap.appendChild(document.createTextNode(label));
      }
    });
    if (!shown) wrap.appendChild(document.createTextNode('n/a'));
    return wrap;
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

  /* ---------------- macro engine ---------------- */
  function renderEngine(d) {
    var upd = document.querySelector('#engine-updated');
    if (d.updated) upd.textContent = fmtDateTime(d.updated);
    var box = document.querySelector('#engine-rows');
    (d.rows || []).forEach(function (row) {
      var r = el('div', 'engine-row');
      var head = el('div', 'engine-head');
      head.appendChild(el('span', 'engine-title', row.title));
      head.appendChild(srcLabel(row.sources || row.source, row.source_url));
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

      c.appendChild(srcLabel(ch.sources || ch.source, ch.source_url));
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
      var hl = el('div', 'wire-headline');
      var hlUrl = safeUrl(it.url);
      if (hlUrl) {
        var ha = el('a', null, it.headline);
        ha.href = hlUrl;
        ha.target = '_blank';
        ha.rel = 'noopener noreferrer';
        hl.appendChild(ha);
      } else {
        hl.textContent = it.headline;
      }
      body.appendChild(hl);
      var ul = el('ul', null);
      (it.bullets || []).forEach(function (b) { ul.appendChild(el('li', null, b)); });
      body.appendChild(ul);
      body.appendChild(srcLabel(it.sources || []));
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
