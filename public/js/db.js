const LocalDB = (() => {
  const DB_NAME='fazendapro', DB_VERSION=3;
  let db=null;
  function uuid(){return Date.now().toString(36)+Math.random().toString(36).slice(2);}
  function open(){
    return new Promise((res,rej)=>{
      if(db)return res(db);
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=e=>{
        const d=e.target.result;
        ['animais','pesagens','saude','nascimentos','reproducao','mortalidade'].forEach(s=>{
          if(!d.objectStoreNames.contains(s)){
            const st=d.createObjectStore(s,{keyPath:'sync_id'});
            st.createIndex('synced','synced',{unique:false});
          }
        });
      };
      req.onsuccess=e=>{db=e.target.result;res(db);};
      req.onerror=()=>rej(req.error);
    });
  }
  async function add(store,data){
    const d=await open();
    return new Promise((res,rej)=>{
      const obj={...data,sync_id:uuid(),synced:0,created_at:new Date().toISOString()};
      const tx=d.transaction(store,'readwrite');
      const r=tx.objectStore(store).add(obj);
      r.onsuccess=()=>res(obj);
      r.onerror=()=>rej(r.error);
    });
  }
  async function getAll(store){
    const d=await open();
    return new Promise((res,rej)=>{
      const tx=d.transaction(store,'readonly');
      const r=tx.objectStore(store).getAll();
      r.onsuccess=()=>res(r.result);
      r.onerror=()=>rej(r.error);
    });
  }
  async function getPending(store){return(await getAll(store)).filter(r=>!r.synced);}
  async function markSynced(store,sync_id){
    const d=await open();
    return new Promise((res,rej)=>{
      const tx=d.transaction(store,'readwrite');
      const os=tx.objectStore(store);
      const r=os.get(sync_id);
      r.onsuccess=()=>{const o=r.result;if(o){o.synced=1;os.put(o);}res();};
      r.onerror=()=>rej(r.error);
    });
  }
  async function countPending(){
    const stores=['animais','pesagens','saude','nascimentos','reproducao','mortalidade'];
    const counts=await Promise.all(stores.map(s=>getPending(s)));
    return counts.reduce((a,c)=>a+c.length,0);
  }
  async function clearSynced(){
    const stores=['animais','pesagens','saude','nascimentos','reproducao','mortalidade'];
    for(const store of stores){
      const all=await getAll(store);
      const d=await open();
      for(const r of all.filter(x=>x.synced)){
        await new Promise(res=>{const tx=d.transaction(store,'readwrite');tx.objectStore(store).delete(r.sync_id);tx.oncomplete=res;});
      }
    }
  }
  return{add,getAll,getPending,markSynced,countPending,clearSynced};
})();
