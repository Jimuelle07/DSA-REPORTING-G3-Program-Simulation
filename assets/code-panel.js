(() => {
  'use strict';

  var MARK = '\u0000';
  var BASE_KW = ['typedef', 'struct', 'bool', 'int', 'char', 'void', 'const', 'size_t', 'return', 'if', 'while', 'for'];
  var KW = new Set();
  var LIT = new Set(['NULL', 'true', 'false']);
  var TOKEN_RE;

  function configureTypes(types) {
    var words = BASE_KW.concat(Array.isArray(types) ? types.map(String) : []);
    KW = new Set(words);
    TOKEN_RE = new RegExp('/\\*.*?\\*/|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|\\b(?:' + words.join('|') + ')\\b|\\b(?:NULL|true|false)\\b|\\b\\d+\\b|[A-Za-z_]\\w*(?=\\()', 'g');
  }

  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) {
      if (c === '&') return '&amp;';
      if (c === '<') return '&lt;';
      if (c === '>') return '&gt;';
      if (c === '"') return '&quot;';
      return '&#39;';
    });
  }

  function tokenizeLine(line) {
    if (/^\s*#/.test(line)) {
      return '<span class="tok-pp">' + esc(line) + '</span>';
    }
    var out = '';
    var last = 0;
    var m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(line)) !== null) {
      var t = m[0];
      if (m.index > last) out += esc(line.slice(last, m.index));
      var cls;
      if (t.slice(0, 2) === '/*') cls = 'tok-com';
      else if (t[0] === '"' || t[0] === "'") cls = 'tok-str';
      else if (KW.has(t)) cls = 'tok-kw';
      else if (LIT.has(t)) cls = 'tok-num';
      else if (/^\d+$/.test(t)) cls = 'tok-num';
      else cls = 'tok-fn';
      out += '<span class="' + cls + '">' + esc(t) + '</span>';
      last = m.index + t.length;
    }
    if (last < line.length) out += esc(line.slice(last));
    return out;
  }

  function mount(rootEl, options) {
    options = options || {};
    var source = String(options.source == null ? '' : options.source);
    var anchors = options.anchors || {};
    var title = String(options.title == null ? 'UNDO_REDO.C' : options.title);
    var filename = String(options.filename == null ? 'undo_redo.c' : options.filename);
    var sectionLabels = Array.isArray(options.sections) ? options.sections : ['DATA', 'STACK OPS', 'UNDO/REDO', 'HELPERS', 'MAIN'];
    var formatWatch = typeof options.formatWatch === 'function' ? options.formatWatch : function (w) {
      var doc = String(w.doc == null ? '' : w.doc);
      if (doc.length > 40) doc = doc.slice(0, 40) + '\u2026';
      return 'undoStack.top = ' + w.undoTop + ' \u00B7 redoStack.top = ' + w.redoTop + ' \u00B7 capacity = ' + w.capacity + ' \u00B7 doc = ' + String.fromCharCode(34) + doc + String.fromCharCode(34);
    };
    configureTypes(options.types);
    var rawLines = source.split('\n');
    if (source.slice(-1) === '\n') rawLines.pop();

    var sectionLines = [];
    for (var s = 0; s < rawLines.length; s++) {
      if (/\/\* -+ \d+\./.test(rawLines[s])) sectionLines.push(s + 1);
    }

    var codeHtml = '';
    for (var i = 0; i < rawLines.length; i++) {
      var n = i + 1;
      codeHtml += '<span class="code__line" data-line="' + n + '">' +
        '<span class="code__ln">' + n + '</span>' +
        '<span class="code__src">' + tokenizeLine(rawLines[i]) + '</span>' +
        '<span class="code__badge"></span></span>';
    }

    var sectionsHtml = '';
    for (var k = 0; k < sectionLines.length; k++) {
      var label = sectionLabels[k] || ('SECTION ' + (k + 1));
      sectionsHtml += '<button type="button" class="code-panel__section" data-line="' +
        sectionLines[k] + '">' + esc(label) + '</button>'; 
    }

    rootEl.innerHTML =
      '<header class="code-panel__header">' +
        '<h2 class="code-panel__title">' + esc(title) + '</h2>' +
        '<div class="code-panel__actions">' +
          '<button type="button" class="btn btn--white code-panel__copy">COPY</button>' +
          '<button type="button" class="btn btn--white code-panel__download">\u2193 .C</button>' +
          '<button type="button" class="btn btn--white code-panel__follow" aria-pressed="true">FOLLOW</button>' +
        '</div>' +
      '</header>' +
      '<nav class="code-panel__sections" aria-label="Code sections">' + sectionsHtml + '</nav>' +
      '<div class="code-panel__scroll" tabindex="0">' +
        '<pre class="code"><code>' + codeHtml + '</code></pre>' +
      '</div>' +
      '<p class="code-panel__calls"></p>' +
      '<p class="code-panel__watch"></p>' +
      '<p class="code-panel__error" hidden>TRACE UNAVAILABLE</p>';

    var scrollEl = rootEl.querySelector('.code-panel__scroll');
    var callsEl = rootEl.querySelector('.code-panel__calls');
    var watchEl = rootEl.querySelector('.code-panel__watch');
    var errEl = rootEl.querySelector('.code-panel__error');
    var copyBtn = rootEl.querySelector('.code-panel__copy');
    var downloadBtn = rootEl.querySelector('.code-panel__download');
    var followBtn = rootEl.querySelector('.code-panel__follow');
    var sectionBtns = rootEl.querySelectorAll('.code-panel__section');

    var lineEls = new Map();
    Array.prototype.forEach.call(rootEl.querySelectorAll('.code__line'), function (el) {
      lineEls.set(Number(el.dataset.line), el);
    });

    var anchorMap = new Map();
    var ok = true;
    Object.keys(anchors).forEach(function (fn) {
      var snippets = anchors[fn] || [];
      var startRe = new RegExp('^[A-Za-z_][^;]*\\b' + fn + '\\(');
      var start = -1;
      for (var a = 0; a < rawLines.length; a++) {
        if (startRe.test(rawLines[a])) { start = a; break; }
      }
      var end = -1;
      if (start >= 0) {
        if (rawLines[start].indexOf('}') !== -1) {
          end = start;
        } else {
          for (var b = start + 1; b < rawLines.length; b++) {
            if (rawLines[b] === '}') { end = b; break; }
          }
        }
      }
      snippets.forEach(function (snip) {
        var found = -1;
        var count = 0;
        if (start >= 0 && end >= 0) {
          for (var c = start; c <= end; c++) {
            if (rawLines[c].indexOf(snip) !== -1) { count++; if (count === 1) found = c; }
          }
        }
        if (count === 1) {
          anchorMap.set(fn + MARK + snip, found + 1);
        } else {
          ok = false;
          if (window.console && console.error) {
            console.error('CodePanel: cannot resolve anchor [' + fn + ', ' + snip + ']');
          }
        }
      });
    });
    if (!ok) errEl.hidden = false;

    var follow = true;
    var fadeTimers = [];
    var state = null;

    function clearFadeTimers() {
      for (var i2 = 0; i2 < fadeTimers.length; i2++) clearTimeout(fadeTimers[i2]);
      fadeTimers.length = 0;
    }

    function setBadge(el, count) {
      var badge = el.querySelector('.code__badge');
      if (badge) badge.textContent = count == null ? '' : '\u00D7' + count;
    }

    function clearHighlight() {
      clearFadeTimers();
      lineEls.forEach(function (el) {
        el.classList.remove('is-exec', 'is-ran', 'is-fading');
        var badge = el.querySelector('.code__badge');
        if (badge) badge.textContent = '';
      });
    }

    function setCalls(text) {
      callsEl.textContent = text == null ? '' : String(text);
    }

    function setWatch(w) {
      if (!w) { watchEl.textContent = ''; return; }
      watchEl.textContent = String(formatWatch(w));
    }

    function followLine(el) {
      var r = el.getBoundingClientRect();
      var sr = scrollEl.getBoundingClientRect();
      scrollEl.scrollTop += (r.top - sr.top) - (scrollEl.clientHeight - r.height) / 2;
    }

    function scheduleFade() {
      fadeTimers.push(setTimeout(function () {
        lineEls.forEach(function (el) {
          if (el.classList.contains('is-ran')) el.classList.add('is-fading');
        });
      }, 1500));
      fadeTimers.push(setTimeout(function () {
        lineEls.forEach(function (el) { el.classList.remove('is-ran', 'is-fading'); });
      }, 2100));
    }

    function finishPlayback(s) {
      if (s.done) return;
      s.done = true;
      if (state === s) state = null;
      if (s.timer) { clearTimeout(s.timer); s.timer = null; }
      scheduleFade();
      if (s.resolve) s.resolve();
    }

    function advance(s) {
      if (s.i >= s.steps.length) { finishPlayback(s); return; }
      stepTo(s, s.steps[s.i]);
      s.i++;
      s.timer = setTimeout(function () { advance(s); }, s.delay);
    }

    function stepTo(s, st) {
      if (s.prevEl) {
        s.prevEl.classList.remove('is-exec');
        if (s.prevEl !== st.el) s.prevEl.classList.add('is-ran');
      }
      st.el.classList.remove('is-ran');
      st.el.classList.add('is-exec');
      if (st.count != null) setBadge(st.el, st.count);
      s.prevEl = st.el;
      if (follow) followLine(st.el);
    }

    function play(result) {
      result = result || {};
      if (state) skip();
      clearHighlight();
      setCalls(result.callTrace);
      setWatch(result.watch);

      var trace = Array.isArray(result.trace) ? result.trace : [];
      var s = {
        steps: [],
        i: 0,
        prevEl: null,
        timer: null,
        done: false,
        resolve: null,
        delay: 0
      };
      var promise = new Promise(function (res) { s.resolve = res; });

      if (!ok || trace.length === 0) {
        s.done = true;
        s.resolve();
        return promise;
      }

      for (var t = 0; t < trace.length; t++) {
        var item = trace[t];
        var lineNo = anchorMap.get(item[0] + MARK + item[1]);
        if (lineNo == null) continue;
        var el = lineEls.get(lineNo);
        if (!el) continue;
        s.steps.push({ el: el, count: item.length > 2 ? item[2] : null });
      }

      if (s.steps.length === 0) {
        s.done = true;
        s.resolve();
        return promise;
      }

      state = s;
      var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

      if (reduced) {
        for (var r = 0; r < s.steps.length; r++) {
          s.steps[r].el.classList.add('is-ran');
          if (s.steps[r].count != null) setBadge(s.steps[r].el, s.steps[r].count);
        }
        var last = s.steps[s.steps.length - 1].el;
        last.classList.remove('is-ran');
        last.classList.add('is-exec');
        finishPlayback(s);
        return promise;
      }

      s.delay = Math.min(90, 1200 / s.steps.length);
      advance(s);
      return promise;
    }

    function skip() {
      var s = state;
      if (!s || s.done) return;
      if (s.timer) { clearTimeout(s.timer); s.timer = null; }
      while (s.i < s.steps.length) { stepTo(s, s.steps[s.i]); s.i++; }
      finishPlayback(s);
    }

    function flashCopyLabel() {
      copyBtn.textContent = 'COPIED \u2713';
      setTimeout(function () { copyBtn.textContent = 'COPY'; }, 1200);
    }

    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = source;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
      flashCopyLabel();
    }

    copyBtn.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(source).then(flashCopyLabel, fallbackCopy);
      } else {
        fallbackCopy();
      }
    });

    downloadBtn.addEventListener('click', function () {
      var blob = new Blob([source], { type: 'text/x-c' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    });

    followBtn.addEventListener('click', function () {
      follow = followBtn.getAttribute('aria-pressed') !== 'true';
      followBtn.setAttribute('aria-pressed', follow ? 'true' : 'false');
    });

    Array.prototype.forEach.call(sectionBtns, function (btn) {
      btn.addEventListener('click', function () {
        var el = lineEls.get(Number(btn.dataset.line));
        if (!el) return;
        var r = el.getBoundingClientRect();
        var sr = scrollEl.getBoundingClientRect();
        scrollEl.scrollTop += r.top - sr.top;
      });
    });

    return {
      ok: ok,
      play: play,
      skip: skip,
      setWatch: setWatch
    };
  }

  globalThis.CodePanel = { mount: mount };
})();
