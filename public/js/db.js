const LocalDB = (() => {
  const DB_NAME = 'fazendapro';
  const DB_VERSION = 1;
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('animais')) {
          const s = d.createObjectStore('animais', { keyPath: 'sync_id' });
          s.createIndex('synced', 'synced', { unique: false });
        }
        if (!d.objectStoreNames.contains('pesagens')) {
          const s = d.createObjectStore('pesagens', { keyPath: 'sync_id' });
          s.createIndex('synced', 'synced', { unique: false });
        }
        if (!d.objectStoreNames.contains('saude')) {
          const s = d.createObjectStore('saude', { keyPath: 'sync_id' });
          s.createIndex('synced', 'synced', { unique: false });
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function uuid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  async function add(store, data) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const obj = { ...data, sync_id: uuid(), synced: 0, created_at: new Date().toISOString() };
      const tx = d.transaction(store, 'readwrite');
      const req = tx.objectStore(store).add(obj);
      req.onsuccess = () => resolve(obj);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(store) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getPending(store) {
    const all = await getAll(store);
    return all.filter(r => !r.synced);
  }

  async function markSynced(store, sync_id) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      const req = os.get(sync_id);
      req.onsuccess = () => {
        const obj = req.result;
        if (obj) { obj.synced = 1; os.put(obj); }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function countPending() {
    const [a, p, s] = await Promise.all([
      getPending('animais'), getPending('pesagens'), getPending('saude')
    ]);
    return a.length + p.length + s.length;
  }

  async function clearSynced() {
    const stores = ['animais', 'pesagens', 'saude'];
    for (const store of stores) {
      const all = await getAll(store);
      const d = await open();
      for (const r of all.filter(x => x.synced)) {
        await new Promise(res => {
          const tx = d.transaction(store, 'readwrite');
          tx.objectStore(store).delete(r.sync_id);
          tx.oncomplete = res;
        });
      }
    }
  }

  return { add, getAll, getPending, markSynced, countPending, clearSynced };
})();
