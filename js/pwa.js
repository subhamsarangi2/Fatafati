let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const btn = document.getElementById('install-btn');
  if (btn) btn.style.display = 'none';
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('install-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') btn.style.display = 'none';
    deferredPrompt = null;
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
