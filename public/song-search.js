/* Lightweight song autocomplete backed by Apple's iTunes Search API.
   No key, no cost; uses JSONP so there are no CORS issues. Attach to any text
   input; picking a result sets the value to "Title — Artist". Free-typing still
   works if nothing is chosen. Styling is via .ss-* classes the page provides. */
(function () {
  var active = null;

  function jsonp(url, cb) {
    var s = document.createElement('script');
    var name = '__ss_' + Math.random().toString(36).slice(2);
    var done = false;
    window[name] = function (data) { done = true; try { cb(data); } finally { cleanup(); } };
    function cleanup() { try { delete window[name]; } catch (e) { window[name] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
    s.onerror = function () { if (!done) { try { cb(null); } finally { cleanup(); } } };
    s.src = url + '&callback=' + name;
    document.body.appendChild(s);
  }

  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }

  function close() { if (active) { if (active.parentNode) active.parentNode.removeChild(active); active = null; } }

  document.addEventListener('click', function (e) { if (active && !active.contains(e.target) && e.target !== active._input) close(); });

  function highlight(items, i) {
    items.forEach(function (x) { x.classList.remove('on'); });
    if (i < 0) i = items.length - 1; if (i >= items.length) i = 0;
    if (items[i]) items[i].classList.add('on');
  }

  function render(input, results) {
    close();
    if (!results || !results.length) return;
    var box = document.createElement('div'); box.className = 'ss-drop'; box._input = input;
    results.forEach(function (r) {
      var label = (r.trackName || '') + (r.artistName ? ' — ' + r.artistName : '');
      var art = (r.artworkUrl60 || r.artworkUrl100 || '').replace('100x100', '60x60');
      var it = document.createElement('div'); it.className = 'ss-item';
      it.innerHTML = '<img class="ss-thumb" src="' + art + '" alt="" loading="lazy"><span class="ss-meta"><span class="ss-title"></span><span class="ss-artist"></span></span>';
      it.querySelector('.ss-title').textContent = r.trackName || '';
      it.querySelector('.ss-artist').textContent = r.artistName || '';
      it.addEventListener('mousedown', function (e) { e.preventDefault(); input.value = label; close(); input.focus(); input.dispatchEvent(new Event('change')); });
      box.appendChild(it);
    });
    var row = input.closest('.songrow') || input.parentElement;
    row.appendChild(box);
    active = box;
  }

  function attach(input) {
    if (!input || input.dataset.ssBound) return; input.dataset.ssBound = '1';
    input.setAttribute('autocomplete', 'off');
    var run = debounce(function () {
      var q = input.value.trim();
      if (q.length < 2) { close(); return; }
      jsonp('https://itunes.apple.com/search?entity=song&limit=6&term=' + encodeURIComponent(q), function (data) {
        if (!data || !data.results || document.activeElement !== input) return;
        render(input, data.results);
      });
    }, 260);
    input.addEventListener('input', run);
    input.addEventListener('focus', function () { if (input.value.trim().length >= 2) run(); });
    input.addEventListener('keydown', function (e) {
      if (!active || active._input !== input) return;
      var items = [].slice.call(active.querySelectorAll('.ss-item'));
      if (!items.length) return;
      var cur = active.querySelector('.ss-item.on');
      var idx = items.indexOf(cur);
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(items, idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(items, idx - 1); }
      else if (e.key === 'Enter') { if (cur) { e.preventDefault(); cur.dispatchEvent(new MouseEvent('mousedown')); } }
      else if (e.key === 'Escape') { close(); }
    });
  }

  window.SongSearch = { attach: attach, attachAll: function (sel) { [].slice.call(document.querySelectorAll(sel)).forEach(attach); } };
})();
