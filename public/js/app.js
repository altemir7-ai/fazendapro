const App = (() => {
  let me = null;
  const hoje = () => new Date().toISOString().slice(0,10);
  const fmtData = d => { if(!d)return'—'; const[y,m,dd]=d.split('-'); return`${dd}/${m}/${y}`; };
  const fmtBR = v => Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const diasAte = d => Math.round((new Date(d)-new Date())/86400000);
  const catBadge = {Vaca:'b-teal',Touro:'b-blue',Novilha:'b-amber',Bezerro:'b-green',Bezerra:'b-pink',Boi:'b-gray'};

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
        <button class="btn btn-sm btn-danger" onclick="deleteAnimal(${a.id})">×</button>
      </div>`).join(''):'<div class="empty"><div class="empty-icon">🐄</div><div class="empty-text">Nenhum animal encontrado.</div></div>';
  }

  window.filtrarRebanho=(f,btn)=>{filtroRebanho=f;document.querySelectorAll('.filter-btn-rebanho').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderRebanho();};
  window.buscarRebanho=(v)=>{buscaRebanho=v;renderRebanho();};
  window.deleteAnimal=async(id)=>{if(!confirm('Remover este animal?'))return;await api('DELETE',`/api/animais/${id}`);loadRebanho();toast('Animal removido.');};

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
        <div class="list-right"><div style="font-weight:700;color:${f.tipo==='entrada'?'#0F6E56':'#dc2626'}">${f.tipo==='entrada'?'+':'-'} R$ ${fmtBR(f.valor)}</div></div>
      </div>`).join(''):'<div class="empty"><div class="empty-icon">💵</div><div class="empty-text">Nenhum lançamento ainda.</div></div>';
  }

  window.addFin=async()=>{
    const valor=parseFloat(document.getElementById('fin-valor').value);
    if(!valor||valor<=0){toast('Informe um valor válido.');return;}
    try{
      await api('POST','/api/financeiro',{tipo:document.getElementById('fin-tipo').value,categoria:document.getElementById('fin-cat').value,valor,data:document.getElementById('fin-data').value||hoje(),observacao:document.getElementById('fin-obs').value.trim()});
      ['fin-valor','fin-obs'].forEach(x=>document.getElementById(x).value='');
      closeSheet('sheet-fin'); loadFinanceiro(); toast('Lançamento registrado!');
    }catch(e){toast(e.message);}
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
    pendingAction={tipo:'desativar',id,nome,codigo};
    document.getElementById('ov-confirm-titulo').textContent='Desativar vaqueiro';
    document.getElementById('ov-confirm-body').innerHTML=`Desativar acesso de <strong>${nome}</strong> (${codigo})?<br><br><span style="color:#059669">✓ Histórico mantido · ✓ Pode reativar depois</span><br><span style="color:#dc2626">✗ Não conseguirá entrar no app</span>`;
    document.getElementById('ov-confirm-btn').textContent='Desativar';
    document.getElementById('ov-confirm').classList.add('show');
  };
  window.confirmarApagar=(id,nome,codigo,regs)=>{
    pendingAction={tipo:'apagar',id,nome,codigo};
    document.getElementById('ov-confirm-titulo').textContent='Apagar permanentemente';
    document.getElementById('ov-confirm-body').innerHTML=`Apagar <strong>${nome}</strong> (${codigo}) permanentemente?<br><br><span style="color:#059669">✓ ${regs} registro(s) são mantidos</span><br><span style="color:#dc2626">✗ Esta ação não pode ser desfeita</span>`;
    document.getElementById('ov-confirm-btn').textContent='Apagar';
    document.getElementById('ov-confirm').classList.add('show');
  };
  window.executarConfirm=async()=>{
    if(!pendingAction)return;
    const{tipo,id,nome,codigo}=pendingAction; pendingAction=null;
    document.getElementById('ov-confirm').classList.remove('show');
    try{
      if(tipo==='desativar'){await api('PATCH',`/api/vaqueiros/${id}/desativar`);toast(`${nome} desativado.`);}
      else if(tipo==='apagar'){await api('DELETE',`/api/vaqueiros/${id}`);toast(`${nome} removido.`);}
      else if(tipo==='senha'){const s=document.getElementById('nv-senha').value;await api('PATCH',`/api/vaqueiros/${id}/senha`,{senha:s});document.getElementById('ov-senha').classList.remove('show');toast(`Senha de ${nome} atualizada!`);}
      await loadVaqueiros();
    }catch(e){toast('Erro: '+e.message);}
  };
  window.cancelarConfirm=()=>{ pendingAction=null; document.getElementById('ov-confirm').classList.remove('show'); };
  window.reativar=async id=>{ const w=vaqueirosCache.find(x=>x.id===id); try{await api('PATCH',`/api/vaqueiros/${id}/reativar`);toast(`${w?.nome||'Vaqueiro'} reativado!`);await loadVaqueiros();}catch(e){toast(e.message);} };
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
    document.getElementById('wk-page-'+page).classList.add('active');
    btn.classList.add('active');
    if(page==='home')updatePendingIndicator();
    if(page==='nasc-list-page')loadNascimentosWorker();
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
