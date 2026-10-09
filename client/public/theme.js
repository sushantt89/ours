// Applies the saved theme before first paint so there is no flash. Kept as a file (not inline)
// so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var mode = localStorage.getItem('ours:mode') || 'system';
    var dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.accent = localStorage.getItem('ours:accent') || 'rose';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#171114' : '#fbf6f2');
  } catch (e) {}
})();
