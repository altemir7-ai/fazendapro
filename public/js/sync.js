const Sync = (() => {
  let syncing=false, onStatusChange=null;
  function setCallback(fn){onStatusChange=fn;}
  function isOnline(){return navigator.onLine;}
  async function run(){
    if(syncing||!isOnline())return;
    syncing=true;
    onStatusChange&&onStatusChange('syncing');
    try{
      const [animais,pesagens,saude,nascimentos,reproducao,mortalidade]=await Promise.all([
        LocalDB.getPending('animais'),LocalDB.getPending('pesagens'),LocalDB.getPending('saude'),
        LocalDB.getPending('nascimentos'),LocalDB.getPending('reproducao'),LocalDB.getPending('mortalidade')
      ]);
      const temDados=animais.length||pesagens.length||saude.length||nascimentos.length||reproducao.length||mortalidade.length;
      if(!temDados){syncing=false;onStatusChange&&onStatusChange('online');return;}

      // Sync mortalidade separado
      for(const m of mortalidade){
        try{
          await fetch('/api/mortalidade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
          await LocalDB.markSynced('mortalidade',m.sync_id);
        }catch(e){}
      }

      // Sync demais
      const res=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({animais,pesagens,saude,nascimentos,reproducao})});
      if(res.status===401){syncing=false;onStatusChange&&onStatusChange('online');return;}
      const data=await res.json();
      if(data.ok){
        for(const a of animais)await LocalDB.markSynced('animais',a.sync_id);
        for(const p of pesagens)await LocalDB.markSynced('pesagens',p.sync_id);
        for(const s of saude)await LocalDB.markSynced('saude',s.sync_id);
        for(const n of nascimentos)await LocalDB.markSynced('nascimentos',n.sync_id);
        for(const r of reproducao)await LocalDB.markSynced('reproducao',r.sync_id);
        await LocalDB.clearSynced();
      }
    }catch(e){console.log('Sync erro:',e.message);}
    syncing=false;
    const pending=await LocalDB.countPending();
    onStatusChange&&onStatusChange(isOnline()?'online':'offline',pending);
  }
  async function updateStatusBar(){
    const pending=await LocalDB.countPending();
    onStatusChange&&onStatusChange(isOnline()?'online':'offline',pending);
  }
  window.addEventListener('online',()=>setTimeout(run,1000));
  window.addEventListener('offline',()=>onStatusChange&&onStatusChange('offline'));
  navigator.serviceWorker&&navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='DO_SYNC')run();});
  setInterval(()=>{if(isOnline())run();},30000);
  return{run,updateStatusBar,setCallback,isOnline};
})();
