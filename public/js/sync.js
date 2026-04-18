const Sync = (() => {
  let syncing = false;
  let onStatusChange = null;

  function setCallback(fn) { onStatusChange = fn; }

  function isOnline() { return navigator.onLine; }

  async function run() {
    if (syncing || !isOnline()) return;
    syncing = true;
    onStatusChange && onStatusChange('syncing');

    try {
      const [animais, pesagens, saude] = await Promise.all([
        LocalDB.getPending('animais'),
        LocalDB.getPending('pesagens'),
        LocalDB.getPending('saude')
      ]);

      if (!animais.length && !pesagens.length && !saude.length) {
        syncing = false;
        onStatusChange && onStatusChange('online');
        return;
      }

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animais, pesagens, saude })
      });

      if (res.status === 401) {
        syncing = false;
        onStatusChange && onStatusChange('online');
        return;
      }

      const data = await res.json();

      if (data.ok) {
        for (const a of animais) await LocalDB.markSynced('animais', a.sync_id);
        for (const p of pesagens) await LocalDB.markSynced('pesagens', p.sync_id);
        for (const s of saude) await LocalDB.markSynced('saude', s.sync_id);
        await LocalDB.clearSynced();
        console.log('Sync OK:', data.synced);
      }
    } catch (e) {
      console.log('Sync falhou (offline?):', e.message);
    }

    syncing = false;
    const pending = await LocalDB.countPending();
    onStatusChange && onStatusChange(isOnline() ? 'online' : 'offline', pending);
  }

  async function updateStatusBar() {
    const pending = await LocalDB.countPending();
    onStatusChange && onStatusChange(isOnline() ? 'online' : 'offline', pending);
  }

  window.addEventListener('online', () => {
    console.log('Conectado — iniciando sincronização...');
    setTimeout(run, 1000);
  });

  window.addEventListener('offline', () => {
    onStatusChange && onStatusChange('offline');
  });

  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'DO_SYNC') run();
  });

  setInterval(() => { if (isOnline()) run(); }, 30000);

  return { run, updateStatusBar, setCallback, isOnline };
})();
