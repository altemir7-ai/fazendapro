const App = (() => {
  let me = null;
  const hoje = () => new Date().toISOString().slice(0,10);
  const fmtData = d => { if(!d)return'—'; const[y,m,dd]=d.split('-'); return`${dd}/${m}/${y}`; };
  const fmtBR = v => Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const diasAte = d => Math.round((new Date(d)-new Date())/86400000);
  const catBadge = {Vaca:'b-teal',Touro:'b-blue',Novilha:'b-amber',Bezerro:'b-green',Bezerra:'b-pink',Boi:'b-gray'};

  // ── SISTEMA DE CONFIRMAÇÃO CENTRALIZADO ──────────
  const Confirm = (() => {
    let _callback = null;

    function mostrar({icone='⚠️', titulo, corpo, labelConfirmar='Confirmar', tipo='danger', callback}){
      document.getElementById('cm-icon').textContent = icone;
      document.getElementById('cm-title').textContent = titulo;
      document.getElementById('cm-body').innerHTML = corpo;
      const btn = document.getElementById('cm-btn');
      btn.textContent = labelConfirmar;
      btn.className = `confirm-modal-confirm ${tipo}`;
      _callback = callback;
      document.getElementById('confirm-modal-bg').classList.add('show');
    }

    function cancelar(){
      _callback = null;
      document.getElementById('confirm-modal-bg').classList.remove('show');
    }

    async function executar(){
      document.getElementById('confirm-modal-bg').classList.remove('show');
      if(_callback) await _callback();
      _callback = null;
    }

    return { mostrar, cancelar, executar };
  })();

  window.Confirm = Confirm;

  async function api(method,path,body){
    const opts={method,headers:{'Content-Type':'application/json'}};
    if(body)opts.body=JSON.stringify(body);
    const r=await fetch(path,opts);
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Erro desconhecido');
    return data;
  }

  // ── TOAST ──
  function toast(msg,dur=2800){
    const el=document.getElementById('toast');
    el.textContent=msg; el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'),dur);
  }

  // ── STATUS BAR ──
  Sync.setCallback((status,pending=0)=>{
    ['status-bar','status-bar-w'].forEach(id=>{
      const bar=document.getElementById(id); if(!bar)return;
      bar.className='status-bar '+status;
      bar.querySelector('.status-dot').className='status-dot '+(status==='online'?'dot-green':status==='syncing'?'dot-blue':'dot-amber');
      bar.querySelector('.status-txt').textContent=status==='syncing'?'Enviando dados...':status==='online'?(pending>0?'Sincronizando...':'Online — dados sincronizados'):'Offline — dados salvos no celular';
      const pb=bar.querySelector('.pending-badge');
      pb.textContent=pending>0?pending+' pendente(s)':'';
      pb.style.display=pending>0?'inline':'none';
    });
    if(me?.role==='worker')updatePendingIndicator();
  });

  async function updatePendingIndicator(){
    const n=await LocalDB.countPending();
    const el=document.getElementById('pending-indicator'); if(!el)return;
    el.style.display=n>0?'flex':'none';
    if(n>0){document.getElementById('pending-num').textContent=n; document.getElementById('pending-msg').textContent=n===1?'registro aguardando envio':'registros aguardando envio';}
  }

  // ── LOGIN ──
  let loginRole='owner';
  window.setLoginRole=(role,btn)=>{
    loginRole=role;
    document.querySelectorAll('.role-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('f-owner').classList.toggle('hidden',role!=='owner');
    document.getElementById('f-worker').classList.toggle('hidden',role!=='worker');
    document.getElementById('login-err').textContent='';
  };

  window.doLogin=async()=>{
    const errEl=document.getElementById('login-err'); errEl.textContent='';
    try{
      let body;
      if(loginRole==='owner') body={role:'owner',usuario:document.getElementById('l-usuario').value.trim(),senha:document.getElementById('l-senha').value};
      else body={role:'worker',codigo:document.getElementById('l-codigo').value.trim().toUpperCase(),senha:document.getElementById('l-senha-w').value};
      const data=await api('POST','/api/login',body);
      me=data; initApp();
    }catch(e){errEl.textContent=e.message;}
  };

  window.logout=async()=>{
    await api('POST','/api/logout').catch(()=>{});
    me=null; showScreen('login');
  };

  function initApp(){
    if(me.role==='owner'){
      showScreen('owner');
      document.getElementById('owner-user-chip').textContent='Proprietário';
      loadConfig().then(()=>loadOwnerPage('painel'));
      setInterval(()=>{if(document.getElementById('op-feed')?.classList.contains('active'))loadFeed();},10000);
    } else {
      showScreen('worker');
      document.getElementById('worker-user-chip').textContent=me.nome.split(' ')[0];
      document.getElementById('wk-page-home').classList.add('active');
      setTodayDates();
      updatePendingIndicator();
      Sync.updateStatusBar();
      Sync.run();
    }
  }

  function showScreen(s){
    ['login','owner','worker'].forEach(x=>document.getElementById('screen-'+x).classList.toggle('hidden',x!==s));
  }

  // ── CONFIG ──
  let cfg={};
  async function loadConfig(){
    try{
      cfg=await api('GET','/api/config');
      document.getElementById('owner-fazenda-nome').textContent=cfg.fazenda_nome||'FazendaPro';
      document.getElementById('topbar-fazenda-nome').textContent=cfg.fazenda_nome||'FazendaPro';
    }catch(e){}
  }

  // ── OWNER NAV ──
  window.ownerNav=(page,btn)=>{
    document.querySelectorAll('.owner-page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.owner-nav-item').forEach(b=>b.classList.remove('active'));
    document.getElementById('op-'+page).classList.add('active');
    btn.classList.add('active');
    loadOwnerPage(page);
  };

  function loadOwnerPage(page){
    if(page==='painel')loadDash();
    if(page==='feed')loadFeed();
    if(page==='rebanho')loadRebanho();
    if(page==='saude')loadSaude();
    if(page==='financeiro')loadFinanceiro();
    if(page==='vaqueiros')loadVaqueiros();
    if(page==='relatorios')renderRelatorios();
    if(page==='config')renderConfig();
    if(page==='conferencia')loadConferencias();
    if(page==='mortalidade')loadMortalidade();
  }

  // ── DASHBOARD ──
  async function loadDash(){
    try{
      const d=await api('GET','/api/dashboard');
      cfg=d.config||cfg;
      document.getElementById('owner-fazenda-nome').textContent=cfg.fazenda_nome||'FazendaPro';
      document.getElementById('topbar-fazenda-nome').textContent=cfg.fazenda_nome||'FazendaPro';
      document.getElementById('dash-animais').textContent=d.animais;
      document.getElementById('dash-vaqueiros').textContent=d.vaqueiros;
      document.getElementById('dash-nascimentos').textContent=d.nasc_mes;
      document.getElementById('dash-gestantes').textContent=d.gestantes;
      document.getElementById('dash-saude').textContent=d.saude_venc;
      document.getElementById('dash-saude').style.color=d.saude_venc>0?'#dc2626':'#0F6E56';
      document.getElementById('dash-saldo').textContent='R$ '+fmtBR(d.saldo);
      document.getElementById('dash-saldo').style.color=d.saldo>=0?'#0F6E56':'#dc2626';
      document.getElementById('dash-feed').innerHTML=renderFeedHtml(d.feed.slice(0,8));
      // Alertas
      let alertsHtml='';
      if(d.saude_venc>0) alertsHtml+=`<div class="alert al-red">⚠️ ${d.saude_venc} procedimento(s) de saúde vencido(s). <button class="btn btn-sm" style="margin-left:8px" onclick="enviarAlertaWhatsApp()">Alertar via WhatsApp</button></div>`;
      d.alertas_saude.filter(s=>diasAte(s.proxima_dose)>=0&&diasAte(s.proxima_dose)<=30).forEach(s=>{
        const d_=diasAte(s.proxima_dose);
        alertsHtml+=`<div class="alert al-amber">💉 ${s.animal_brinco}${s.animal_nome?' ('+s.animal_nome+')':''} — ${s.produto} em ${d_===0?'hoje':d_+'d'}</div>`;
      });
      d.partos_prox.forEach(p=>{
        const d_=diasAte(p.data_parto_previsto);
        alertsHtml+=`<div class="alert al-blue">🐄 Parto previsto: ${p.femea_brinco}${p.animal_nome?' ('+p.animal_nome+')':''} em ${d_<=0?'em breve':d_+'d'}</div>`;
      });
      if(!alertsHtml)alertsHtml='<div class="alert al-green">✅ Nenhum alerta no momento. Tudo em dia!</div>';
      document.getElementById('dash-alerts').innerHTML=alertsHtml;
    }catch(e){console.error(e);}
  }

  window.enviarAlertaWhatsApp=async()=>{
    try{
      const d=await api('GET','/api/alertas/whatsapp');
      if(d.url){window.open(d.url,'_blank');} else toast(d.msg||'Nenhum alerta.');
    }catch(e){toast('Configure o WhatsApp nas configurações.');}
  };

  async function loadFeed(){
    try{
      const feed=await api('GET','/api/feed');
      document.getElementById('feed-list').innerHTML=renderFeedHtml(feed);
    }catch(e){}
  }

  function renderFeedHtml(feed){
    if(!feed?.length)return'<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Nenhuma atividade ainda.</div></div>';
    return feed.map(f=>`<div class="feed-item"><div class="feed-dot fd-${f.cor}"></div><div><div class="feed-title">${f.vaqueiro_nome||'Sistema'} — ${f.descricao}</div><div class="feed-meta">${f.tipo} · ${fmtData(f.data)} às ${f.hora}</div></div></div>`).join('');
  }

  // ── REBANHO ──
  let animaisCache=[], filtroRebanho='todos', buscaRebanho='';
  async function loadRebanho(){
    try{
      animaisCache=await api('GET','/api/animais');
      document.getElementById('rebanho-count').textContent=animaisCache.length+' animal(is)';
      renderRebanho();
    }catch(e){}
  }

  function renderRebanho(){
    const busca=buscaRebanho.toLowerCase();
    let lista=animaisCache.filter(a=>{
      const mb=!busca||(a.brinco+a.nome+a.raca+a.categoria).toLowerCase().includes(busca);
      const mf=filtroRebanho==='todos'||a.categoria===filtroRebanho;
      return mb&&mf;
    });
    document.getElementById('animais-list').innerHTML=lista.length?lista.map(a=>`
      <div class="list-item">
        <div class="list-icon" style="background:#f0fdf9">${a.categoria==='Touro'?'🐂':a.categoria==='Bezerro'||a.categoria==='Bezerra'?'🐄':'🐄'}</div>
        <div class="list-body">
          <div class="list-title">${a.brinco}${a.nome?' — '+a.nome:''}</div>
          <div class="list-sub"><span class="badge ${catBadge[a.categoria]||'b-gray'}">${a.categoria}</span> ${a.raca}${a.peso?' · '+a.peso+' kg':''}</div>
          ${a.mae_brinco?`<div class="list-sub">Mãe: ${a.mae_brinco}${a.pai_brinco?' · Pai: '+a.pai_brinco:''}</div>`:''}
          <div class="list-sub">Por: ${a.vaqueiro_nome||'Proprietário'} · ${fmtData(a.criado_em)}</div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="deleteAnimal(${a.id},'${a.brinco}','${(a.nome||'').replace(/'/g,"\\'")}')">×</button>
      </div>`).join(''):'<div class="empty"><div class="empty-icon">🐄</div><div class="empty-text">Nenhum animal encontrado.</div></div>';
  }

  window.filtrarRebanho=(f,btn)=>{filtroRebanho=f;document.querySelectorAll('.filter-btn-rebanho').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderRebanho();};
  window.buscarRebanho=(v)=>{buscaRebanho=v;renderRebanho();};
  window.deleteAnimal=async(id,brinco,nome)=>{
    Confirm.mostrar({
      icone:'🐄',
      titulo:'Remover animal',
      corpo:`Deseja remover o animal <strong>${brinco}${nome?' — '+nome:''}</strong> do rebanho ativo?<br><br>O registro será mantido no histórico.`,
      labelConfirmar:'Remover',
      tipo:'danger',
      callback: async()=>{ await api('DELETE',`/api/animais/${id}`); loadRebanho(); toast('Animal removido.'); }
    });
  };

  // ── SAÚDE ──
  async function loadSaude(){
    try{
      const rows=await api('GET','/api/saude');
      document.getElementById('saude-list').innerHTML=rows.length?rows.map(s=>{
        const d=s.proxima_dose?diasAte(s.proxima_dose):null;
        const pb=s.proxima_dose?`<span class="badge ${d<0?'b-red':d<=30?'b-amber':'b-green'}">${fmtData(s.proxima_dose)}</span>`:'';
        return`<div class="list-item"><div class="list-icon" style="background:#fef3c7">💉</div><div class="list-body"><div class="list-title">${s.animal_brinco} — ${s.tipo}</div><div class="list-sub">${s.produto}${s.dose?' · '+s.dose:''} · ${fmtData(s.data)}</div>${pb?`<div style="margin-top:4px">Próxima: ${pb}</div>`:''}<div class="list-sub">Por: ${s.vaqueiro_nome||'Proprietário'}</div></div></div>`;
      }).join(''):'<div class="empty"><div class="empty-icon">💉</div><div class="empty-text">Nenhum registro de saúde.</div></div>';
    }catch(e){}
  }

  // ── FINANCEIRO ──
  let finCache=[];
  async function loadFinanceiro(){
    try{
      finCache=await api('GET','/api/financeiro');
      const ent=finCache.filter(f=>f.tipo==='entrada').reduce((a,f)=>a+f.valor,0);
      const sai=finCache.filter(f=>f.tipo==='saida').reduce((a,f)=>a+f.valor,0);
      document.getElementById('fin-ent').textContent='R$ '+fmtBR(ent);
      document.getElementById('fin-sai').textContent='R$ '+fmtBR(sai);
      document.getElementById('fin-sal').textContent='R$ '+fmtBR(ent-sai);
      document.getElementById('fin-sal').style.color=ent-sai>=0?'#0F6E56':'#dc2626';
      renderFinanceiro();
    }catch(e){}
  }

  function renderFinanceiro(){
    document.getElementById('fin-list').innerHTML=finCache.length?finCache.map(f=>`
      <div class="list-item">
        <div class="list-icon" style="background:${f.tipo==='entrada'?'#d1fae5':'#fee2e2'}">${f.tipo==='entrada'?'📈':'📉'}</div>
        <div class="list-body">
          <div class="list-title">${f.categoria}</div>
          <div class="list-sub">${fmtData(f.data)}${f.observacao?' · '+f.observacao:''}</div>
          <div class="list-sub">Por: ${f.vaqueiro_nome||'Proprietário'}</div>
        </div>
        <div class="list-right" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div style="font-weight:700;color:${f.tipo==='entrada'?'#0F6E56':'#dc2626'}">${f.tipo==='entrada'?'+':'-'} R$ ${fmtBR(f.valor)}</div>
          <button class="btn btn-sm btn-danger" onclick="excluirLancamento(${f.id},'${f.categoria}',${f.valor},'${f.tipo}')">Excluir</button>
        </div>
      </div>`).join(''):'<div class="empty"><div class="empty-icon">💵</div><div class="empty-text">Nenhum lançamento ainda.</div></div>';
  }

  window.excluirLancamento = async(id, categoria, valor, tipo) => {
    Confirm.mostrar({
      icone: tipo==='entrada'?'📈':'📉',
      titulo: 'Excluir lançamento',
      corpo: `Deseja excluir este lançamento?<br><br>Categoria: <strong>${categoria}</strong><br>Valor: <strong>${tipo==='entrada'?'+':'-'} R$ ${fmtBR(valor)}</strong><br><br><span style="color:#dc2626">✗ Esta ação não pode ser desfeita.</span>`,
      labelConfirmar: 'Excluir',
      tipo: 'danger',
      callback: async() => {
        try {
          await api('DELETE', `/api/financeiro/${id}`);
          await loadFinanceiro();
          toast('Lançamento excluído.');
        } catch(e) { toast('Erro: '+e.message); }
      }
    });
  };

  window.addFin=async()=>{
    const valor=parseFloat(document.getElementById('fin-valor').value);
    if(!valor||valor<=0){toast('Informe um valor válido.');return;}
    const tipo=document.getElementById('fin-tipo').value;
    const cat=document.getElementById('fin-cat').value;
    const data=document.getElementById('fin-data').value||hoje();
    const obs=document.getElementById('fin-obs').value.trim();
    Confirm.mostrar({
      icone:tipo==='entrada'?'📈':'📉',
      titulo:'Confirmar lançamento',
      corpo:`Confirma o registro de <strong>${tipo==='entrada'?'entrada':'saída'}</strong>?<br><br>Categoria: <strong>${cat}</strong><br>Valor: <strong>R$ ${fmtBR(valor)}</strong>`,
      labelConfirmar:'Lançar',
      tipo:'primary',
      callback:async()=>{
        try{
          await api('POST','/api/financeiro',{tipo,categoria:cat,valor,data,observacao:obs});
          ['fin-valor','fin-obs'].forEach(x=>document.getElementById(x).value='');
          closeSheet('sheet-fin'); loadFinanceiro(); toast('Lançamento registrado!');
        }catch(e){toast(e.message);}
      }
    });
  };

  // ── NASCIMENTOS ──
  let nascCache=[];
  async function loadNascimentos(){
    try{
      nascCache=await api('GET','/api/nascimentos');
      document.getElementById('nasc-list').innerHTML=nascCache.length?nascCache.map(n=>`
        <div class="list-item">
          <div class="list-icon" style="background:#f0fdf9">🐄</div>
          <div class="list-body">
            <div class="list-title">Bezerro: ${n.brinco_bezerro}${n.nome_bezerro?' — '+n.nome_bezerro:''}</div>
            <div class="list-sub"><span class="badge ${n.sexo==='Macho'?'b-blue':'b-pink'}">${n.sexo}</span> · Mãe: ${n.mae_brinco}${n.pai_brinco?' · Pai: '+n.pai_brinco:''}</div>
            <div class="list-sub">${fmtData(n.data_nascimento)}${n.peso_nascimento?' · '+n.peso_nascimento+' kg':''} · <span class="badge ${n.condicao==='Normal'?'b-green':'b-amber'}">${n.condicao}</span></div>
            <div class="list-sub">Por: ${n.vaqueiro_nome||'Proprietário'}</div>
          </div>
        </div>`).join(''):'<div class="empty"><div class="empty-icon">🐄</div><div class="empty-text">Nenhum nascimento registrado.</div></div>';
    }catch(e){}
  }

  // ── VAQUEIROS ──
  let vaqueirosCache=[], filtroVaqueiros='todos', buscaVaqueiros='';

  async function loadVaqueiros(){
    try{ vaqueirosCache=await api('GET','/api/vaqueiros'); renderVaqueiros(); }catch(e){}
  }

  function renderVaqueiros(){
    const busca=buscaVaqueiros.toLowerCase();
    let lista=vaqueirosCache.filter(w=>{
      const mb=!busca||w.nome.toLowerCase().includes(busca)||w.codigo.toLowerCase().includes(busca)||(w.telefone||'').includes(busca);
      const mf=filtroVaqueiros==='todos'||(filtroVaqueiros==='ativos'&&w.ativo)||(filtroVaqueiros==='inativos'&&!w.ativo);
      return mb&&mf;
    });
    const ativos=lista.filter(w=>w.ativo), inativos=lista.filter(w=>!w.ativo);
    const totA=vaqueirosCache.filter(w=>w.ativo).length, totI=vaqueirosCache.filter(w=>!w.ativo).length;
    document.getElementById('vaq-counter').textContent=`${totA} ativo(s) · ${totI} inativo(s)`;
    let html='';
    if(ativos.length){ html+=`<div class="section-title">Ativos (${ativos.length})</div>`; html+=ativos.map(w=>workerCard(w)).join(''); }
    if(inativos.length){ html+=`<div class="section-title" style="margin-top:1rem">Desativados (${inativos.length})</div>`; html+=inativos.map(w=>workerCard(w,true)).join(''); }
    document.getElementById('vaqueiros-list').innerHTML=html||'<div class="empty"><div class="empty-icon">👤</div><div class="empty-text">Nenhum vaqueiro.</div></div>';
  }

  function workerCard(w,inativo=false){
    const ini=w.nome.trim().split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
    const regs=(w.tot_animais||0)+(w.tot_pesagens||0)+(w.tot_saude||0)+(w.tot_nascimentos||0);
    return`<div class="worker-item" style="${inativo?'opacity:.65':''}">
      <div class="wk-av ${inativo?'inactive':''}">${ini}</div>
      <div class="wk-info">
        <div class="wk-name">${w.nome}</div>
        <div class="wk-meta">${w.codigo}${w.telefone?' · '+w.telefone:''}</div>
        <div class="wk-meta">${regs} registro(s) · desde ${fmtData(w.criado_em)}</div>
        <div style="margin-top:5px"><span class="badge ${inativo?'b-red':'b-green'}">${inativo?'Desativado':'Ativo'}</span></div>
      </div>
      <div class="wk-actions">
        ${inativo?`
          <button class="btn btn-sm" onclick="reativar(${w.id})">Reativar</button>
          <button class="btn btn-sm btn-danger" onclick="confirmarApagar(${w.id},'${w.nome.replace(/'/g,"\\'")}','${w.codigo}',${regs})">Apagar</button>
        `:`
          <button class="btn btn-sm" onclick="editarVaqueiro(${w.id},'${w.nome.replace(/'/g,"\\'")}','${(w.telefone||'').replace(/'/g,"\\'")}')">Editar</button>
          <button class="btn btn-sm" onclick="editarSenha(${w.id},'${w.nome.replace(/'/g,"\\'")}')">Senha</button>
          <button class="btn btn-sm btn-danger" onclick="confirmarDesativar(${w.id},'${w.nome.replace(/'/g,"\\'")}','${w.codigo}')">Excluir</button>
        `}
      </div>
    </div>`;
  }

  window.filtrarVaqueiros=(f,btn)=>{ filtroVaqueiros=f; document.querySelectorAll('.vaq-filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderVaqueiros(); };
  window.buscarVaqueiros=v=>{ buscaVaqueiros=v; renderVaqueiros(); };

  let pendingAction=null;
  window.confirmarDesativar=(id,nome,codigo)=>{
    Confirm.mostrar({
      icone:'👤',
      titulo:'Desativar vaqueiro',
      corpo:`Deseja desativar o acesso de <strong>${nome}</strong> (${codigo})?<br><br><span style="color:#059669">✓ Histórico mantido</span><br><span style="color:#059669">✓ Pode ser reativado depois</span><br><span style="color:#dc2626">✗ Não conseguirá entrar no app</span>`,
      labelConfirmar:'Desativar',
      tipo:'danger',
      callback: async()=>{ await api('PATCH',`/api/vaqueiros/${id}/desativar`); toast(`${nome} desativado.`); await loadVaqueiros(); }
    });
  };

  window.confirmarApagar=(id,nome,codigo,regs)=>{
    Confirm.mostrar({
      icone:'🗑️',
      titulo:'Apagar permanentemente',
      corpo:`Apagar <strong>${nome}</strong> (${codigo}) permanentemente?<br><br><span style="color:#059669">✓ ${regs} registro(s) são mantidos</span><br><span style="color:#dc2626">✗ Esta ação não pode ser desfeita</span>`,
      labelConfirmar:'Apagar',
      tipo:'danger',
      callback: async()=>{ await api('DELETE',`/api/vaqueiros/${id}`); toast(`${nome} removido.`); await loadVaqueiros(); }
    });
  };
  window.executarConfirm=async()=>{
    if(!pendingAction)return;
    const{tipo,id,nome}=pendingAction; pendingAction=null;
    document.getElementById('ov-confirm').classList.remove('show');
    try{
      if(tipo==='senha'){const s=document.getElementById('nv-senha').value;await api('PATCH',`/api/vaqueiros/${id}/senha`,{senha:s});document.getElementById('ov-senha').classList.remove('show');toast(`Senha de ${nome} atualizada!`);}
      await loadVaqueiros();
    }catch(e){toast('Erro: '+e.message);}
  };
  window.cancelarConfirm=()=>{ pendingAction=null; document.getElementById('ov-confirm').classList.remove('show'); };
  window.reativar=async id=>{
    const w=vaqueirosCache.find(x=>x.id===id);
    Confirm.mostrar({
      icone:'✅',
      titulo:'Reativar vaqueiro',
      corpo:`Deseja reativar o acesso de <strong>${w?.nome||'este vaqueiro'}</strong>?<br><br>Ele poderá entrar no app novamente.`,
      labelConfirmar:'Reativar',
      tipo:'primary',
      callback: async()=>{ await api('PATCH',`/api/vaqueiros/${id}/reativar`); toast(`${w?.nome||'Vaqueiro'} reativado!`); await loadVaqueiros(); }
    });
  };
  window.editarVaqueiro=(id,nome,tel)=>{
    pendingAction=null;
    document.getElementById('ev-id').value=id;
    document.getElementById('ev-nome').value=nome;
    document.getElementById('ev-tel').value=tel||'';
    document.getElementById('ev-err').textContent='';
    document.getElementById('ov-editar').classList.add('show');
    setTimeout(()=>document.getElementById('ev-nome').focus(),300);
  };
  window.fecharEditar=()=>{ document.getElementById('ov-editar').classList.remove('show'); };
  window.salvarEdicao=async()=>{
    const id=document.getElementById('ev-id').value, nome=document.getElementById('ev-nome').value.trim(), tel=document.getElementById('ev-tel').value.trim();
    if(!nome){document.getElementById('ev-err').textContent='Informe o nome.';return;}
    try{await api('PATCH',`/api/vaqueiros/${id}/editar`,{nome,telefone:tel});fecharEditar();await loadVaqueiros();toast(`${nome} atualizado!`);}
    catch(e){document.getElementById('ev-err').textContent=e.message;}
  };
  window.editarSenha=(id,nome)=>{ pendingAction={tipo:'senha',id,nome}; document.getElementById('ov-senha-nome').textContent=nome; document.getElementById('nv-senha').value=''; document.getElementById('nv-senha-err').textContent=''; document.getElementById('ov-senha').classList.add('show'); };
  window.salvarSenha=async()=>{
    const s=document.getElementById('nv-senha').value;
    if(!s||s.length<4){document.getElementById('nv-senha-err').textContent='Mínimo 4 caracteres.';return;}
    await executarConfirm();
  };
  window.fecharSenha=()=>{ pendingAction=null; document.getElementById('ov-senha').classList.remove('show'); };
  window.showAddWorker=()=>{ ['nw-nome','nw-tel','nw-senha'].forEach(x=>document.getElementById(x).value=''); document.getElementById('nw-err').textContent=''; document.getElementById('ov-add-worker').classList.add('show'); setTimeout(()=>document.getElementById('nw-nome').focus(),300); };
  window.closeAddWorker=()=>document.getElementById('ov-add-worker').classList.remove('show');
  window.addWorker=async()=>{
    const nome=document.getElementById('nw-nome').value.trim(), tel=document.getElementById('nw-tel').value.trim(), senha=document.getElementById('nw-senha').value;
    const errEl=document.getElementById('nw-err'); errEl.textContent='';
    if(!nome){errEl.textContent='Informe o nome.';return;}
    if(!senha||senha.length<4){errEl.textContent='Senha mínimo 4 caracteres.';return;}
    try{
      const data=await api('POST','/api/vaqueiros',{nome,telefone:tel,senha});
      closeAddWorker(); await loadVaqueiros(); toast(`Vaqueiro criado! Código: ${data.codigo}`);
      setTimeout(()=>alert(`✅ Vaqueiro cadastrado!\n\nNome: ${data.nome}\nCódigo: ${data.codigo}\nSenha: (a que você definiu)\n\nEnvie estas informações para o vaqueiro acessar o app.`),400);
    }catch(e){errEl.textContent=e.message;}
  };

  // ── RELATÓRIOS ──
  function renderRelatorios(){
    // já renderizado estaticamente no HTML
  }

  window.baixarPDF=()=>{ window.open('/api/relatorio/pdf','_blank'); };
  window.baixarCSV=(tabela)=>{ window.open(`/api/relatorio/csv/${tabela}`,'_blank'); };

  // ── CONFIGURAÇÕES ──
  function renderConfig(){
    document.getElementById('cfg-fazenda-nome').value=cfg.fazenda_nome||'';
    document.getElementById('cfg-foco').value=cfg.fazenda_foco||'Corte';
    document.getElementById('cfg-raca').value=cfg.fazenda_raca||'Nelore';
    document.getElementById('cfg-whatsapp').value=cfg.whatsapp_alertas||'';
    document.getElementById('cfg-email').value=cfg.email_alertas||'';
  }

  window.salvarConfig=async()=>{
    try{
      await api('PATCH','/api/config',{
        fazenda_nome:document.getElementById('cfg-fazenda-nome').value.trim(),
        fazenda_foco:document.getElementById('cfg-foco').value,
        fazenda_raca:document.getElementById('cfg-raca').value,
        whatsapp_alertas:document.getElementById('cfg-whatsapp').value.trim(),
        email_alertas:document.getElementById('cfg-email').value.trim()
      });
      await loadConfig(); toast('Configurações salvas!');
    }catch(e){toast(e.message);}
  };

  window.alterarSenhaOwner=async()=>{
    const sa=document.getElementById('owner-sa').value, sn=document.getElementById('owner-sn').value, sc=document.getElementById('owner-sc').value;
    if(sn!==sc){toast('As novas senhas não coincidem.');return;}
    if(sn.length<4){toast('Nova senha mínimo 4 caracteres.');return;}
    try{ await api('PATCH','/api/owner/senha',{senha_atual:sa,senha_nova:sn}); ['owner-sa','owner-sn','owner-sc'].forEach(x=>document.getElementById(x).value=''); toast('Senha alterada com sucesso!'); }
    catch(e){toast(e.message);}
  };

  // ── WORKER NAV ──
  window.workerNav=(page,btn)=>{
    document.querySelectorAll('.wk-page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.wk-nav-item').forEach(b=>b.classList.remove('active'));
    const pageEl = document.getElementById('wk-page-'+page);
    if(pageEl) pageEl.classList.add('active');
    if(btn) btn.classList.add('active');
    if(page==='home') updatePendingIndicator();
    if(page==='nasc-list-page') loadNascimentosWorker();
    if(page==='conferencia-page'){
      confAtiva=null;
      document.getElementById('conf-setup').classList.remove('hidden');
      document.getElementById('conf-chamada').classList.add('hidden');
    }
  };

  async function loadNascimentosWorker(){
    try{
      const rows=await api('GET','/api/nascimentos').catch(()=>[]);
      document.getElementById('w-nasc-list').innerHTML=rows.length?rows.slice(0,20).map(n=>`
        <div class="list-item"><div class="list-icon" style="background:#f0fdf9">🐄</div><div class="list-body">
          <div class="list-title">Bezerro ${n.brinco_bezerro}${n.nome_bezerro?' — '+n.nome_bezerro:''}</div>
          <div class="list-sub">Mãe: ${n.mae_brinco} · ${fmtData(n.data_nascimento)}</div>
          <div class="list-sub"><span class="badge ${n.sexo==='Macho'?'b-blue':'b-pink'}">${n.sexo}</span>${n.peso_nascimento?' · '+n.peso_nascimento+' kg':''}</div>
        </div></div>`).join(''):'<div class="empty"><div class="empty-icon">🐄</div><div class="empty-text">Nenhum nascimento registrado ainda.</div></div>';
    }catch(e){}
  }

  function setTodayDates(){
    const t=hoje();
    ['w-p-data','w-s-data','w-n-data','w-rep-data','fin-data'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=t;});
  }

  window.openSheet=id=>document.getElementById(id).classList.add('show');
  window.closeSheet=id=>document.getElementById(id).classList.remove('show');

  // ── WORKER SUBMITS ──
  async function wSave(store, data, sucId, sheetId, feedMsg, clearIds){
    try{
      await LocalDB.add(store,data);
      clearIds.forEach(x=>{ const el=document.getElementById(x); if(el)el.value=''; });
      setTodayDates();
      closeSheet(sheetId);
      toast(feedMsg+(Sync.isOnline()?' — enviando...':`\nSem internet — será enviado ao conectar.`));
      await Sync.run();
      updatePendingIndicator();
    }catch(e){toast('Erro: '+e.message);}
  }

  window.wSaveAnimal=async()=>{
    const brinco=document.getElementById('w-r-id').value.trim();
    if(!brinco){toast('Informe o brinco do animal.');return;}
    await wSave('animais',{
      brinco, nome:document.getElementById('w-r-nome').value.trim(),
      raca:document.getElementById('w-r-raca').value.trim()||'Nelore',
      categoria:document.getElementById('w-r-cat').value,
      sexo:document.getElementById('w-r-sexo').value,
      nascimento:document.getElementById('w-r-nasc').value||null,
      peso:parseFloat(document.getElementById('w-r-peso').value)||null,
      mae_brinco:document.getElementById('w-r-mae').value.trim(),
      pai_brinco:document.getElementById('w-r-pai').value.trim(),
      origem:document.getElementById('w-r-origem').value,
      observacoes:document.getElementById('w-r-obs').value.trim()
    },'','sheet-animal','Animal salvo!',['w-r-id','w-r-nome','w-r-raca','w-r-nasc','w-r-peso','w-r-mae','w-r-pai','w-r-obs']);
  };

  window.wSavePesagem=async()=>{
    const brinco=document.getElementById('w-p-id').value.trim(), peso=parseFloat(document.getElementById('w-p-peso').value);
    if(!brinco||!peso){toast('Informe o brinco e o peso.');return;}
    await wSave('pesagens',{animal_brinco:brinco,peso,data:document.getElementById('w-p-data').value||hoje(),condicao:document.getElementById('w-p-cc').value,observacoes:document.getElementById('w-p-obs').value.trim()},'','sheet-pesagem','Pesagem salva!',['w-p-id','w-p-peso','w-p-obs']);
  };

  window.wSaveSaude=async()=>{
    const brinco=document.getElementById('w-s-id').value.trim();
    if(!brinco){toast('Informe o brinco do animal.');return;}
    await wSave('saude',{animal_brinco:brinco,tipo:document.getElementById('w-s-tipo').value,produto:document.getElementById('w-s-desc').value.trim(),dose:document.getElementById('w-s-dose').value.trim(),data:document.getElementById('w-s-data').value||hoje(),proxima_dose:document.getElementById('w-s-prox').value||null,custo:parseFloat(document.getElementById('w-s-custo').value)||0,observacoes:document.getElementById('w-s-obs').value.trim()},'','sheet-saude','Procedimento salvo!',['w-s-id','w-s-desc','w-s-dose','w-s-prox','w-s-custo','w-s-obs']);
  };

  window.wSaveNascimento=async()=>{
    const brinco=document.getElementById('w-n-brinco').value.trim(), mae=document.getElementById('w-n-mae').value.trim();
    if(!brinco||!mae){toast('Informe o brinco do bezerro e a mãe.');return;}
    await wSave('nascimentos',{brinco_bezerro:brinco,nome_bezerro:document.getElementById('w-n-nome').value.trim(),sexo:document.getElementById('w-n-sexo').value,mae_brinco:mae,pai_brinco:document.getElementById('w-n-pai').value.trim(),data_nascimento:document.getElementById('w-n-data').value||hoje(),peso_nascimento:parseFloat(document.getElementById('w-n-peso').value)||null,condicao:document.getElementById('w-n-cond').value,raca:document.getElementById('w-n-raca').value.trim()||'Nelore',observacoes:document.getElementById('w-n-obs').value.trim()},'','sheet-nascimento','Nascimento registrado!',['w-n-brinco','w-n-nome','w-n-mae','w-n-pai','w-n-peso','w-n-obs']);
  };

  window.wSaveRepro=async()=>{
    const femea=document.getElementById('w-rep-femea').value.trim();
    if(!femea){toast('Informe o brinco da fêmea.');return;}
    const dataEvento=document.getElementById('w-rep-data').value||hoje();
    const tipo=document.getElementById('w-rep-tipo').value;
    // Calcular parto previsto (283 dias)
    const dataParto=new Date(dataEvento); dataParto.setDate(dataParto.getDate()+283);
    await wSave('reproducao',{femea_brinco:femea,tipo,touro_brinco:document.getElementById('w-rep-touro').value.trim(),semen:document.getElementById('w-rep-semen').value.trim(),data_evento:dataEvento,resultado:document.getElementById('w-rep-resultado').value,data_parto_previsto:dataParto.toISOString().slice(0,10),observacoes:document.getElementById('w-rep-obs').value.trim()},'','sheet-repro','Evento reprodutivo salvo!',['w-rep-femea','w-rep-touro','w-rep-semen','w-rep-obs']);
  };

  // ── CONFERÊNCIA DO GADO ──────────────────────────
  let confAtiva = null;
  let confAnimaisRegistrados = [];

  async function loadConferencias(){
    try{
      const rows = await api('GET','/api/conferencias');
      const el = document.getElementById('conf-list-owner');
      if(!el) return;
      if(!rows.length){
        el.innerHTML='<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Nenhuma conferência realizada ainda.</div></div>';
        return;
      }
      el.innerHTML = rows.map(c=>`
        <div class="card" style="margin-bottom:.75rem;padding:1rem">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;flex-wrap:wrap;gap:6px">
            <div>
              <div style="font-size:14px;font-weight:700">Lote: ${c.lote} — ${fmtData(c.data)}</div>
              <div style="font-size:12px;color:#888;margin-top:2px">Por: ${c.vaqueiro_nome||'Proprietário'}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span class="badge b-green">${c.confirmados||c.total_presentes} presentes</span>
              ${(c.ausentes||c.total_ausentes)>0?`<span class="badge b-red">${c.ausentes||c.total_ausentes} ausentes</span>`:''}
              <span class="badge ${c.status==='finalizada'?'b-teal':'b-amber'}">${c.status==='finalizada'?'Finalizada':'Em andamento'}</span>
              ${c.status!=='finalizada'?`<button class="btn btn-sm btn-danger" onclick="deletarConferencia(${c.id})">×</button>`:''}
            </div>
          </div>
          <button class="btn btn-sm btn-outline" style="border-color:#0F6E56;color:#0F6E56;margin-bottom:.75rem" onclick="toggleAnimaisConferencia(${c.id},this)">Ver lista de animais ▼</button>
          <div id="conf-animais-${c.id}" style="display:none"></div>
        </div>`).join('');
    }catch(e){}
  }

  window.toggleAnimaisConferencia = async(id, btn)=>{
    const el = document.getElementById(`conf-animais-${id}`);
    if(!el) return;
    if(el.style.display !== 'none'){
      el.style.display='none';
      btn.textContent='Ver lista de animais ▼';
      return;
    }
    btn.textContent='Fechar lista ▲';
    el.style.display='block';
    if(el.innerHTML) return; // já carregado
    el.innerHTML='<div style="color:#888;font-size:13px;padding:.5rem">Carregando...</div>';
    try{
      const data = await api('GET',`/api/conferencias/${id}`);
      if(!data.animais || !data.animais.length){
        el.innerHTML='<div style="color:#888;font-size:13px;padding:.5rem">Nenhum animal registrado nesta conferência.</div>';
        return;
      }
      const presentes = data.animais.filter(a=>a.status==='presente');
      const ausentes  = data.animais.filter(a=>a.status==='ausente');
      let html='';
      if(presentes.length){
        html+=`<div style="font-size:11px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">✓ Presentes (${presentes.length})</div>`;
        html+=presentes.map(a=>`
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0ede8">
            <div style="width:24px;height:24px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">✓</div>
            <div style="font-size:13px;font-weight:600">${a.animal_brinco}${a.animal_nome?' — '+a.animal_nome:''}</div>
          </div>`).join('');
      }
      if(ausentes.length){
        html+=`<div style="font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.04em;margin:10px 0 6px">✗ Ausentes (${ausentes.length})</div>`;
        html+=ausentes.map(a=>`
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0ede8">
            <div style="width:24px;height:24px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">✗</div>
            <div style="font-size:13px;font-weight:600">${a.animal_brinco}${a.animal_nome?' — '+a.animal_nome:''}</div>
          </div>`).join('');
      }
      el.innerHTML=html;
    }catch(e){el.innerHTML='<div style="color:#dc2626;font-size:13px">Erro ao carregar lista.</div>';}
  };

  window.limparConferencias = ()=>{
    Confirm.mostrar({
      icone:'🗑️',
      titulo:'Limpar histórico de conferências',
      corpo:'Deseja apagar <strong>todas</strong> as conferências finalizadas?<br><br><span style="color:#dc2626">✗ Esta ação não pode ser desfeita.</span>',
      labelConfirmar:'Limpar tudo',
      tipo:'danger',
      callback: async()=>{
        try{
          await api('DELETE','/api/conferencias/todas');
          loadConferencias();
          toast('Histórico de conferências limpo.');
        }catch(e){toast('Erro: '+e.message);}
      }
    });
  };

  window.deletarConferencia = async(id)=>{
    Confirm.mostrar({
      icone:'📋',
      titulo:'Excluir conferência',
      corpo:'Deseja excluir esta conferência permanentemente?<br><br><span style="color:#dc2626">✗ Esta ação não pode ser desfeita.</span>',
      labelConfirmar:'Excluir',
      tipo:'danger',
      callback: async()=>{ await api('DELETE',`/api/conferencias/${id}`); loadConferencias(); toast('Conferência excluída.'); }
    });
  };

  // Worker — iniciar conferência
  window.iniciarConferencia = async()=>{
    const lote = document.getElementById('conf-lote').value.trim()||'Geral';
    const total = parseInt(document.getElementById('conf-total').value)||0;
    try{
      const data = await api('POST','/api/conferencias',{lote, total_esperado:total});
      confAtiva = data.id;
      confAnimaisRegistrados = [];
      document.getElementById('conf-lote-display').textContent = lote;
      document.getElementById('conf-total-display').textContent = total||'—';
      document.getElementById('conf-presentes').textContent = '0';
      document.getElementById('conf-ausentes').textContent = '0';
      document.getElementById('conf-brinco-input').value = '';
      document.getElementById('conf-setup').classList.add('hidden');
      document.getElementById('conf-chamada').classList.remove('hidden');
      document.getElementById('conf-log').innerHTML = '';
      toast(`Conferência iniciada — Lote: ${lote}`);
      // Carregar lista do rebanho
      await carregarListaConferencia();
    }catch(e){toast('Erro: '+e.message);}
  };

  async function carregarListaConferencia(){
    const el = document.getElementById('conf-rebanho-lista');
    if(!el) return;
    el.innerHTML='<div style="text-align:center;padding:1rem;color:#888;font-size:13px">Carregando lista do rebanho...</div>';
    try{
      const animais = await api('GET','/api/animais/lista');
      if(!animais || !animais.length){
        el.innerHTML='<div class="empty" style="padding:1rem"><div class="empty-icon">🐄</div><div class="empty-text">Nenhum animal cadastrado ainda.<br>Cadastre animais primeiro.</div></div>';
        return;
      }
      el.innerHTML = animais.map(a=>`
        <div id="conf-item-${a.brinco}" onclick="registrarPelaLista('${a.brinco}','${(a.nome||'').replace(/'/g,"\\'")}',this)"
          style="display:flex;align-items:center;gap:12px;padding:12px 8px;border-bottom:1px solid #f0ede8;cursor:pointer;transition:all .15s;border-radius:8px;-webkit-tap-highlight-color:rgba(0,0,0,.05)">
          <div id="conf-status-${a.brinco}" style="width:38px;height:38px;border-radius:50%;background:#f5f4f0;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;transition:all .2s;border:2px solid #e8e6e0">○</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:700">${a.brinco}${a.nome?' — '+a.nome:''}</div>
            <div style="font-size:12px;color:#888">${a.categoria}${a.raca?' · '+a.raca:''}</div>
          </div>
          <div id="conf-badge-${a.brinco}" style="font-size:12px;color:#aaa;font-weight:500;flex-shrink:0">Pendente</div>
        </div>`).join('');
    }catch(e){
      el.innerHTML=`<div class="empty" style="padding:1rem"><div class="empty-icon">⚠️</div><div class="empty-text">Erro ao carregar lista: ${e.message}</div></div>`;
    }
  }

  window.registrarPelaLista = async(brinco, nome, el)=>{
    if(!confAtiva){toast('Inicie uma conferência primeiro.');return;}
    // Alternar entre presente e ausente
    const statusEl = document.getElementById(`conf-status-${brinco}`);
    const badgeEl = document.getElementById(`conf-badge-${brinco}`);
    const jaPresente = statusEl && statusEl.textContent === '✓';
    const status = jaPresente ? 'ausente' : 'presente';
    try{
      const data = await api('POST',`/api/conferencias/${confAtiva}/registrar`,{brinco, status});
      document.getElementById('conf-presentes').textContent = data.presentes;
      document.getElementById('conf-ausentes').textContent = data.ausentes;
      // Atualizar visual na lista
      if(statusEl){
        statusEl.textContent = status==='presente'?'✓':'✗';
        statusEl.style.background = status==='presente'?'#d1fae5':'#fee2e2';
        statusEl.style.color = status==='presente'?'#065f46':'#991b1b';
      }
      if(badgeEl){
        badgeEl.textContent = status==='presente'?'Presente':'Ausente';
        badgeEl.style.color = status==='presente'?'#065f46':'#991b1b';
        badgeEl.style.fontWeight = '600';
      }
      if(el) el.style.background = status==='presente'?'#f0fdf9':'#fef2f2';
      // Log
      const log = document.getElementById('conf-log');
      const item = document.createElement('div');
      item.style.cssText='display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0ede8';
      item.innerHTML=`<div style="width:28px;height:28px;border-radius:50%;background:${status==='presente'?'#d1fae5':'#fee2e2'};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">${status==='presente'?'✓':'✗'}</div><div><div style="font-size:13px;font-weight:600">${brinco}${nome?' — '+nome:''}</div><div style="font-size:11px;color:#888">${status==='presente'?'Presente':'Ausente'} · ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div></div>`;
      log.insertBefore(item, log.firstChild);
      if(log.querySelector('.empty')) log.querySelector('.empty').remove();
      confAnimaisRegistrados.push({brinco, status});
      // Preencher campo de busca
      document.getElementById('conf-brinco-input').value = '';
    }catch(e){toast('Erro: '+e.message);}
  };

  window.registrarAnimal = async(statusForcar)=>{
    if(!confAtiva){toast('Inicie uma conferência primeiro.');return;}
    const input = document.getElementById('conf-brinco-input');
    const brinco = input.value.trim().toUpperCase();
    if(!brinco){toast('Digite o brinco do animal.');return;}
    const status = statusForcar || 'presente';
    try{
      const data = await api('POST',`/api/conferencias/${confAtiva}/registrar`,{brinco, status});
      input.value='';
      input.focus();
      document.getElementById('conf-presentes').textContent = data.presentes;
      document.getElementById('conf-ausentes').textContent = data.ausentes;
      // Log visual
      const log = document.getElementById('conf-log');
      const item = document.createElement('div');
      item.style.cssText=`display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0ede8;animation:fadein .2s ease`;
      item.innerHTML=`
        <div style="width:32px;height:32px;border-radius:50%;background:${status==='presente'?'#d1fae5':'#fee2e2'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${status==='presente'?'✓':'✗'}</div>
        <div>
          <div style="font-size:13px;font-weight:600">${brinco}${data.animal_nome?' — '+data.animal_nome:''}</div>
          <div style="font-size:11px;color:#888">${status==='presente'?'Presente':'Ausente'} · ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>`;
      log.insertBefore(item, log.firstChild);
      confAnimaisRegistrados.push({brinco, status});
    }catch(e){toast('Erro: '+e.message);}
  };

  window.marcarAusente = ()=> registrarAnimal('ausente');

  window.finalizarConferencia = async()=>{
    if(!confAtiva)return;
    const pres = document.getElementById('conf-presentes').textContent;
    const aus  = document.getElementById('conf-ausentes').textContent;
    Confirm.mostrar({
      icone:'✅',
      titulo:'Finalizar conferência',
      corpo:`Confirma o encerramento da conferência?<br><br><strong>${pres} presente(s)</strong> · <strong>${aus} ausente(s)</strong><br><br>Após finalizar não será possível editar.`,
      labelConfirmar:'Finalizar',
      tipo:'primary',
      callback: async()=>{
        await api('PATCH',`/api/conferencias/${confAtiva}/finalizar`);
        toast(`Conferência finalizada! ${pres} presentes, ${aus} ausentes.`);
        confAtiva=null;
        document.getElementById('conf-setup').classList.remove('hidden');
        document.getElementById('conf-chamada').classList.add('hidden');
      }
    });
  };

  // Enter no campo de brinco
  document.addEventListener('DOMContentLoaded',()=>{
    const inp = document.getElementById('conf-brinco-input');
    if(inp) inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();registrarAnimal('presente');} });
  });

  // ── MORTALIDADE ──────────────────────────────────
  async function loadMortalidade(){
    try{
      const rows = await api('GET','/api/mortalidade');
      const el = document.getElementById('mort-list');
      if(!el) return;
      const causaBadge = {
        'Doença':'b-red','Acidente':'b-amber','Predador':'b-red',
        'Parto':'b-pink','Desconhecida':'b-gray','Não identificada':'b-gray'
      };
      el.innerHTML = rows.length ? rows.map(m=>`
        <div class="list-item">
          <div class="list-icon" style="background:#fee2e2">💀</div>
          <div class="list-body">
            <div class="list-title">${m.animal_brinco}${m.animal_nome?' — '+m.animal_nome:''}</div>
            <div class="list-sub">
              <span class="badge ${causaBadge[m.causa]||'b-gray'}">${m.causa}</span>
              · ${fmtData(m.data_obito)}
              ${m.peso_estimado?' · '+m.peso_estimado+' kg':''}
            </div>
            ${m.localizacao?`<div class="list-sub">📍 ${m.localizacao}</div>`:''}
            ${m.descricao?`<div class="list-sub">${m.descricao}</div>`:''}
            <div class="list-sub">Por: ${m.vaqueiro_nome||'Proprietário'}</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="deletarObito(${m.id})">×</button>
        </div>`).join('') :
        '<div class="empty"><div class="empty-icon">📊</div><div class="empty-text">Nenhum óbito registrado.</div></div>';
      // Estatísticas
      const statEl = document.getElementById('mort-stats');
      if(statEl && rows.length){
        const causas = {};
        rows.forEach(r=>causas[r.causa]=(causas[r.causa]||0)+1);
        statEl.innerHTML = Object.entries(causas).map(([k,v])=>
          `<div class="stat-row" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0ede8"><span>${k}</span><span class="badge b-red">${v}</span></div>`
        ).join('');
      }
    }catch(e){}
  }

  window.deletarObito = async(id)=>{
    Confirm.mostrar({
      icone:'🗑️',
      titulo:'Excluir registro de óbito',
      corpo:'Deseja excluir este registro permanentemente?<br><br><span style="color:#dc2626">✗ Esta ação não pode ser desfeita.</span>',
      labelConfirmar:'Excluir',
      tipo:'danger',
      callback: async()=>{ await api('DELETE',`/api/mortalidade/${id}`); loadMortalidade(); toast('Registro excluído.'); }
    });
  };

  window.wSaveMortalidade = async()=>{
    const brinco = document.getElementById('w-m-brinco').value.trim();
    if(!brinco){toast('Informe o brinco do animal.');return;}
    const nome = document.getElementById('w-m-nome').value.trim();
    const causa = document.getElementById('w-m-causa').value;
    Confirm.mostrar({
      icone:'💀',
      titulo:'Registrar óbito',
      corpo:`Confirma o óbito do animal <strong>${brinco}${nome?' — '+nome:''}</strong>?<br><br>Causa: <strong>${causa}</strong><br><br><span style="color:#dc2626">⚠️ O animal será removido do rebanho ativo automaticamente.</span>`,
      labelConfirmar:'Confirmar óbito',
      tipo:'danger',
      callback: async()=>{
        const data={
          animal_brinco:brinco,animal_nome:nome,
          data_obito:document.getElementById('w-m-data').value||hoje(),
          causa,
          descricao:document.getElementById('w-m-desc').value.trim(),
          localizacao:document.getElementById('w-m-local').value.trim(),
          peso_estimado:parseFloat(document.getElementById('w-m-peso').value)||null
        };
        if(Sync.isOnline()){
          try{
            await api('POST','/api/mortalidade',data);
            ['w-m-brinco','w-m-nome','w-m-desc','w-m-local','w-m-peso'].forEach(x=>document.getElementById(x).value='');
            document.getElementById('w-m-data').value=hoje();
            closeSheet('sheet-mortalidade');
            toast('Óbito registrado com sucesso.');
          }catch(e){toast('Erro: '+e.message);}
        } else {
          await LocalDB.add('mortalidade',data);
          ['w-m-brinco','w-m-nome','w-m-desc','w-m-local','w-m-peso'].forEach(x=>document.getElementById(x).value='');
          document.getElementById('w-m-data').value=hoje();
          closeSheet('sheet-mortalidade');
          toast('Óbito salvo — será enviado ao conectar.');
          updatePendingIndicator();
        }
      }
    });
  };

  // ── BOOT ──
  async function boot(){
    if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
    try{
      const data=await api('GET','/api/me');
      if(data.loggedIn){me=data;initApp();return;}
    }catch(e){}
    showScreen('login');
  }

  document.addEventListener('DOMContentLoaded',boot);
})();
