(() => {
  'use strict';

  try {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});

    navigator.serviceWorker.ready
      .then(() => {
        document.documentElement.dataset.offline = 'ready';
        window.dispatchEvent(new CustomEvent('offline-ready'));
      })
      .catch(() => {});
  } catch (err) {}
})();
