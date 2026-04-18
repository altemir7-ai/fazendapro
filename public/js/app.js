const App = (() => {
  let me = null;
  const hoje = () => new Date().toISOString().slice(0, 10);
  const fmtData = d => { if (!d) return '—'; const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`; };
  const fmtBR = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const diasAte = d => Math.round((new Date(d) - new Date()) / 86400000);

  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro desconhecido');
    return data;
  }

  // ── TOAST ──
  function toast(msg, dur = 2500) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), dur);
  }

  // ── STATUS BAR ──
  Sync.setCallback((status, pending = 0) => {
    const bar = document.getElementById('status-bar');
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-txt');
    const pb = document.getElementById('pending-badge');
    if (!bar) return;
    bar.className = 'status-bar ' + status;
    dot.className = 'status-dot ' + (status === 'online' ? 'dot-green' : status === 'syncing' ? 'dot-blue' : 'dot-amber');
    if (status === 'online') txt.textContent = pending > 0 ? 'Sincronizando...' : 'Online — dados sincronizados';
    else if (status === 'syncing') txt.textContent = 'Enviando dados...';
    else txt.textContent = 'Offline — dados salvos localmente';
    pb.textContent = pending > 0 ? pending + ' pendente(s)' : '';
    pb.style.display = pending > 0 ? 'inline' : 'none';
    if (me && me.role === 'worker') updatePendingIndicator();
  });

  async function updatePendingIndicator() {
    const n = await LocalDB.countPending();
    const el = document.getElementById('pending-indicator');
    if (!el) return;
    if (n > 0) {
      el.style.display = 'flex';
      document.getElementById('pending-num').textContent = n;
      document.getElementById('pending-msg').textContent = n === 1 ? 'registro aguardando envio' : 'registros aguardando envio';
    } else {
      el.style.display = 'none';
    }
  }

  // ── LOGIN ──
  let loginRole = 'owner';
  window.setLoginRole = (role, btn) => {
    loginRole = role;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('f-owner').classList.toggle('hidden', role !== 'owner');
    document.getElementById('f-worker').classList.toggle('hidden', role !== 'worker');
    document.getElementById('login-err').textContent = '';
  };

  window.doLogin = async () => {
    const errEl = document.getElementById('login-err');
    errEl.textContent = '';
    try {
      let body;
      if (loginRole === 'owner') {
        body = { role: 'owner', usuario: document.getElementById('l-usuario').value.trim(), senha: document.getElementById('l-senha').value };
      } else {
        body = { role: 'worker', codigo: document.getElementById('l-codigo').value.trim().toUpperCase(), senha: document.getElementById('l-senha-w').value };
      }
      const data = await api('POST', '/api/login', body);
      me = data;
      initApp();
    } catch (e) {
      errEl.textContent = e.message;
    }
  };

  window.logout = async () => {
    await api('POST', '/api/logout').catch(() => {});
    me = null;
    showScreen('login');
  };

  // ── INICIALIZAÇÃO ──
  function initApp() {
    if (me.role === 'owner') {
      showScreen('owner');
      document.getElementById('owner-user-chip').textContent = 'Proprietário';
      loadOwnerPage('painel');
    } else {
      showScreen('worker');
      document.getElementById('worker-user-chip').textContent = me.nome.split(' ')[0];
      document.getElementById('wk-page-home').classList.add('active');
      setTodayDates();
      updatePendingIndicator();
      Sync.updateStatusBar();
      Sync.run();
    }
  }

  function showScreen(s) {
    ['login', 'owner', 'worker'].forEach(x => {
      document.getElementById('screen-' + x).classList.toggle('hidden', x !== s);
    });
  }

  // ── OWNER ──
  window.ownerNav = (page, btn) => {
    document.querySelectorAll('.owner-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.owner-nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('op-' + page).classList.add('active');
    btn.classList.add('active');
    loadOwnerPage(page);
  };

  function loadOwnerPage(page) {
    if (page === 'painel') loadDash();
    if (page === 'feed') loadFeed();
    if (page === 'animais') loadAnimais();
    if (page === 'saude') loadSaude();
    if (page === 'vaqueiros') loadVaqueiros();
  }

  async function loadDash() {
    try {
      const d = await api('GET', '/api/dashboard');
      const fin = await api('GET', '/api/financeiro').catch(() => []);
      const ent = fin.filter ? fin.filter(f => f.tipo === 'entrada').reduce((a, f) => a + f.valor, 0) : 0;
      const sai = fin.filter ? fin.filter(f => f.tipo === 'saida').reduce((a, f) => a + f.valor, 0) : 0;
      document.getElementById('dash-animais').textContent = d.animais;
      document.getElementById('dash-vaqueiros').textContent = d.vaqueiros;
      document.getElementById('dash-saude').textContent = d.saude_venc;
      document.getElementById('dash-saude').style.color = d.saude_venc > 0 ? '#dc2626' : '#0F6E56';
      document.getElementById('dash-saldo').textContent = 'R$ ' + fmtBR(ent - sai);
      document.getElementById('dash-saldo').style.color = ent - sai >= 0 ? '#0F6E56' : '#dc2626';
      document.getElementById('dash-feed').innerHTML = renderFeedHtml(d.feed.slice(0, 6));
    } catch (e) { console.error(e); }
  }

  async function loadFeed() {
    try {
      const feed = await api('GET', '/api/feed');
      document.getElementById('feed-list').innerHTML = renderFeedHtml(feed);
    } catch (e) { }
  }

  function renderFeedHtml(feed) {
    if (!feed || !feed.length) return '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Nenhuma atividade ainda.</div></div>';
    return feed.map(f => `
      <div class="feed-item">
        <div class="feed-dot fd-${f.cor}"></div>
        <div><div class="feed-title">${f.vaqueiro_nome || 'Sistema'} — ${f.descricao}</div>
        <div class="feed-meta">${f.tipo} · ${fmtData(f.data)} às ${f.hora}</div></div>
      </div>`).join('');
  }

  async function loadAnimais() {
    try {
      const rows = await api('GET', '/api/animais');
      const catBadge = { Vaca: 'b-teal', Touro: 'b-blue', Novilha: 'b-amber', Bezerro: 'b-green', Boi: 'b-gray' };
      document.getElementById('animais-list').innerHTML = rows.length ? rows.map(a => `
        <div class="list-item">
          <div class="list-icon" style="background:#f0fdf9">${a.categoria === 'Touro' ? '🐂' : a.categoria === 'Bezerro' ? '🐄' : '🐄'}</div>
          <div class="list-body">
            <div class="list-title">${a.brinco} ${a.nome ? '— ' + a.nome : ''}</div>
            <div class="list-sub">${a.raca || '—'} · <span class="badge ${catBadge[a.categoria] || 'b-gray'}">${a.categoria}</span>${a.peso ? ' · ' + a.peso + ' kg' : ''}</div>
            <div class="list-sub" style="margin-top:2px">Por: ${a.vaqueiro_nome || 'Proprietário'} · ${fmtData(a.criado_em)}</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="deleteAnimal(${a.id})">×</button>
        </div>`).join('') :
        '<div class="empty"><div class="empty-icon">🐄</div><div class="empty-text">Nenhum animal cadastrado ainda.</div></div>';
    } catch (e) { }
  }

  window.deleteAnimal = async (id) => {
    if (!confirm('Remover este animal?')) return;
    await api('DELETE', `/api/animais/${id}`);
    loadAnimais();
  };

  async function loadSaude() {
    try {
      const rows = await api('GET', '/api/saude');
      document.getElementById('saude-list').innerHTML = rows.length ? rows.map(s => {
        const d = s.proxima_dose ? diasAte(s.proxima_dose) : null;
        const pb = s.proxima_dose ? `<span class="badge ${d < 0 ? 'b-red' : d <= 30 ? 'b-amber' : 'b-green'}">${fmtData(s.proxima_dose)}</span>` : '';
        return `<div class="list-item">
          <div class="list-icon" style="background:#fef3c7">💉</div>
          <div class="list-body">
            <div class="list-title">${s.animal_brinco} — ${s.tipo}</div>
            <div class="list-sub">${s.produto}${s.dose ? ' · ' + s.dose : ''} · ${fmtData(s.data)}</div>
            ${pb ? `<div style="margin-top:4px">Próxima: ${pb}</div>` : ''}
            <div class="list-sub" style="margin-top:2px">Por: ${s.vaqueiro_nome || 'Proprietário'}</div>
          </div>
        </div>`;
      }).join('') : '<div class="empty"><div class="empty-icon">💉</div><div class="empty-text">Nenhum registro de saúde.</div></div>';
    } catch (e) { }
  }

  // ── BUSCA E FILTRO DE VAQUEIROS ──
  let vaqueirosCache = [];
  let filtroVaqueiros = 'todos';
  let buscaVaqueiros = '';

  async function loadVaqueiros() {
    try {
      vaqueirosCache = await api('GET', '/api/vaqueiros');
      renderVaqueiros();
    } catch (e) { console.error(e); }
  }

  function renderVaqueiros() {
    const busca = buscaVaqueiros.toLowerCase();
    let lista = vaqueirosCache.filter(w => {
      const matchBusca = !busca || w.nome.toLowerCase().includes(busca) || w.codigo.toLowerCase().includes(busca) || (w.telefone||'').includes(busca);
      const matchFiltro = filtroVaqueiros === 'todos' || (filtroVaqueiros === 'ativos' && w.ativo) || (filtroVaqueiros === 'inativos' && !w.ativo);
      return matchBusca && matchFiltro;
    });

    const ativos = lista.filter(w => w.ativo);
    const inativos = lista.filter(w => !w.ativo);
    const totalAtivos = vaqueirosCache.filter(w => w.ativo).length;
    const totalInativos = vaqueirosCache.filter(w => !w.ativo).length;

    // atualiza contador no topo
    const counter = document.getElementById('vaq-counter');
    if (counter) counter.textContent = `${totalAtivos} ativo(s) · ${totalInativos} inativo(s)`;

    let html = '';

    if (ativos.length) {
      html += `<div class="section-title">Ativos (${ativos.length})</div>`;
      html += ativos.map(w => workerCard(w)).join('');
    }

    if (inativos.length) {
      html += `<div class="section-title" style="margin-top:1.25rem">Desativados (${inativos.length})</div>`;
      html += inativos.map(w => workerCard(w, true)).join('');
    }

    if (!ativos.length && !inativos.length) {
      html = `<div class="empty"><div class="empty-icon">👤</div><div class="empty-text">${busca ? 'Nenhum vaqueiro encontrado.' : 'Nenhum vaqueiro cadastrado ainda.'}</div></div>`;
    }

    document.getElementById('vaqueiros-list').innerHTML = html;
  }

  function workerCard(w, inativo = false) {
    const iniciais = w.nome.trim().split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
    const registros = (w.total_animais || 0) + (w.total_pesagens || 0) + (w.total_saude || 0);
    return `
      <div class="worker-item" style="${inativo ? 'opacity:.65' : ''}">
        <div class="wk-av ${inativo ? 'inactive' : ''}">${iniciais}</div>
        <div class="wk-info">
          <div class="wk-name">${w.nome}</div>
          <div class="wk-meta">${w.codigo}${w.telefone ? ' · ' + w.telefone : ''}</div>
          <div class="wk-meta" style="margin-top:3px">
            ${registros} registro(s) · desde ${fmtData(w.criado_em)}
          </div>
          <div style="margin-top:5px">
            <span class="badge ${inativo ? 'b-red' : 'b-green'}">${inativo ? 'Desativado' : 'Ativo'}</span>
          </div>
        </div>
        <div class="wk-actions" style="flex-direction:column;align-items:flex-end;gap:6px">
          ${inativo ? `
            <button class="btn btn-sm" onclick="reativar(${w.id})">Reativar</button>
            <button class="btn btn-sm btn-danger" onclick="confirmarApagar(${w.id},'${w.nome.replace(/'/g,"\\'")}','${w.codigo}',${registros})">Apagar</button>
          ` : `
            <button class="btn btn-sm" onclick="editarVaqueiro(${w.id},'${w.nome.replace(/'/g,"\\'")}','${(w.telefone||'').replace(/'/g,"\\'")}')">Editar</button>
            <button class="btn btn-sm" onclick="editarSenha(${w.id},'${w.nome.replace(/'/g,"\\'")}')">Senha</button>
            <button class="btn btn-sm btn-danger" onclick="confirmarDesativar(${w.id},'${w.nome.replace(/'/g,"\\'")}','${w.codigo}')">Excluir</button>
          `}
        </div>
      </div>`;
  }

  // Filtros
  window.filtrarVaqueiros = (f, btn) => {
    filtroVaqueiros = f;
    document.querySelectorAll('.vaq-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderVaqueiros();
  };
  window.buscarVaqueiros = (val) => {
    buscaVaqueiros = val;
    renderVaqueiros();
  };

  // ── DESATIVAR ──
  let pendingAction = null;

  window.confirmarDesativar = (id, nome, codigo) => {
    pendingAction = { tipo: 'desativar', id, nome, codigo };
    document.getElementById('ov-confirm-titulo').textContent = 'Desativar vaqueiro';
    document.getElementById('ov-confirm-body').innerHTML = `
      Deseja desativar o acesso de <strong>${nome}</strong> (${codigo})?<br><br>
      <span style="color:#059669">✓ O histórico de registros é mantido.</span><br>
      <span style="color:#059669">✓ Pode ser reativado a qualquer momento.</span><br>
      <span style="color:#dc2626">✗ Ele não conseguirá mais entrar no app.</span>`;
    document.getElementById('ov-confirm-btn').textContent = 'Desativar';
    document.getElementById('ov-confirm-btn').className = 'btn btn-sm btn-danger';
    document.getElementById('ov-confirm').classList.add('show');
  };

  // ── APAGAR PERMANENTE ──
  window.confirmarApagar = (id, nome, codigo, registros) => {
    pendingAction = { tipo: 'apagar', id, nome, codigo };
    document.getElementById('ov-confirm-titulo').textContent = 'Apagar vaqueiro permanentemente';
    document.getElementById('ov-confirm-body').innerHTML = `
      Deseja apagar <strong>${nome}</strong> (${codigo}) permanentemente?<br><br>
      <span style="color:#059669">✓ Os ${registros} registro(s) dele são mantidos no sistema.</span><br>
      <span style="color:#dc2626">✗ Esta ação não pode ser desfeita.</span><br>
      <span style="color:#dc2626">✗ O código ${codigo} será liberado para reutilização.</span>`;
    document.getElementById('ov-confirm-btn').textContent = 'Apagar permanentemente';
    document.getElementById('ov-confirm-btn').className = 'btn btn-sm btn-danger';
    document.getElementById('ov-confirm').classList.add('show');
  };

  window.executarConfirm = async () => {
    if (!pendingAction) return;
    const { tipo, id, nome, codigo } = pendingAction;
    pendingAction = null;
    document.getElementById('ov-confirm').classList.remove('show');
    try {
      if (tipo === 'desativar') {
        await api('PATCH', `/api/vaqueiros/${id}/desativar`);
        toast(`${nome} desativado com sucesso.`);
      } else if (tipo === 'apagar') {
        await api('DELETE', `/api/vaqueiros/${id}`);
        toast(`${nome} (${codigo}) removido permanentemente.`);
      } else if (tipo === 'senha') {
        const novaSenha = document.getElementById('nv-senha').value;
        await api('PATCH', `/api/vaqueiros/${id}/senha`, { senha: novaSenha });
        document.getElementById('ov-senha').classList.remove('show');
        toast(`Senha de ${nome} atualizada!`);
      }
      await loadVaqueiros();
    } catch (e) { toast('Erro: ' + e.message); }
  };

  window.cancelarConfirm = () => {
    pendingAction = null;
    document.getElementById('ov-confirm').classList.remove('show');
  };

  // ── REATIVAR ──
  window.reativar = async (id) => {
    const w = vaqueirosCache.find(x => x.id === id);
    try {
      await api('PATCH', `/api/vaqueiros/${id}/reativar`);
      toast(`${w ? w.nome : 'Vaqueiro'} reativado!`);
      await loadVaqueiros();
    } catch (e) { toast('Erro: ' + e.message); }
  };

  // ── EDITAR VAQUEIRO ──
  window.editarVaqueiro = (id, nome, telefone) => {
    document.getElementById('ev-id').value = id;
    document.getElementById('ev-nome').value = nome;
    document.getElementById('ev-tel').value = telefone || '';
    document.getElementById('ev-err').textContent = '';
    document.getElementById('ov-editar').classList.add('show');
    setTimeout(() => document.getElementById('ev-nome').focus(), 300);
  };
  window.fecharEditar = () => {
    document.getElementById('ov-editar').classList.remove('show');
    document.getElementById('ev-err').textContent = '';
  };
  window.salvarEdicao = async () => {
    const id = document.getElementById('ev-id').value;
    const nome = document.getElementById('ev-nome').value.trim();
    const tel = document.getElementById('ev-tel').value.trim();
    const errEl = document.getElementById('ev-err');
    errEl.textContent = '';
    if (!nome) { errEl.textContent = 'Informe o nome completo.'; return; }
    try {
      await api('PATCH', `/api/vaqueiros/${id}/editar`, { nome, telefone: tel });
      fecharEditar();
      await loadVaqueiros();
      toast(`Dados de ${nome} atualizados!`);
    } catch (e) { errEl.textContent = e.message; }
  };

  // ── EDITAR SENHA ──
  window.editarSenha = (id, nome) => {
    pendingAction = { tipo: 'senha', id, nome };
    document.getElementById('ov-senha-nome').textContent = nome;
    document.getElementById('nv-senha').value = '';
    document.getElementById('nv-senha-err').textContent = '';
    document.getElementById('ov-senha').classList.add('show');
  };
  window.salvarSenha = async () => {
    const senha = document.getElementById('nv-senha').value;
    const errEl = document.getElementById('nv-senha-err');
    if (!senha || senha.length < 4) { errEl.textContent = 'Mínimo 4 caracteres.'; return; }
    await executarConfirm();
  };
  window.fecharSenha = () => {
    pendingAction = null;
    document.getElementById('ov-senha').classList.remove('show');
  };

  // ── ADICIONAR ──
  window.showAddWorker = () => {
    ['nw-nome','nw-tel','nw-senha'].forEach(x => document.getElementById(x).value = '');
    document.getElementById('nw-err').textContent = '';
    document.getElementById('ov-add-worker').classList.add('show');
    setTimeout(() => document.getElementById('nw-nome').focus(), 300);
  };
  window.closeAddWorker = () => {
    document.getElementById('ov-add-worker').classList.remove('show');
    document.getElementById('nw-err').textContent = '';
  };
  window.addWorker = async () => {
    const nome = document.getElementById('nw-nome').value.trim();
    const tel = document.getElementById('nw-tel').value.trim();
    const senha = document.getElementById('nw-senha').value;
    const errEl = document.getElementById('nw-err');
    errEl.textContent = '';
    if (!nome) { errEl.textContent = 'Informe o nome completo.'; return; }
    if (!senha || senha.length < 4) { errEl.textContent = 'A senha deve ter no mínimo 4 caracteres.'; return; }
    try {
      const data = await api('POST', '/api/vaqueiros', { nome, telefone: tel, senha });
      closeAddWorker();
      await loadVaqueiros();
      toast(`Vaqueiro cadastrado! Código: ${data.codigo}`);
      setTimeout(() => {
        alert(
          `✅ Vaqueiro cadastrado!\n\n` +
          `Nome: ${data.nome}\n` +
          `Código: ${data.codigo}\n` +
          `Senha: (a que você definiu)\n\n` +
          `Envie o código e a senha para o vaqueiro acessar o app.`
        );
      }, 400);
    } catch (e) { errEl.textContent = e.message; }
  };

  // ── WORKER ──
  window.workerNav = (page, btn) => {
    document.querySelectorAll('.wk-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.wk-nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('wk-page-' + page).classList.add('active');
    btn.classList.add('active');
    if (page === 'home') updatePendingIndicator();
  };

  function setTodayDates() {
    const t = hoje();
    ['w-p-data', 'w-s-data'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = t;
    });
  }

  window.openSheet = (id) => document.getElementById(id).classList.add('show');
  window.closeSheet = (id) => document.getElementById(id).classList.remove('show');

  window.wSaveAnimal = async () => {
    const brinco = document.getElementById('w-r-id').value.trim();
    if (!brinco) { toast('Informe o brinco do animal.'); return; }
    await LocalDB.add('animais', {
      brinco,
      nome: document.getElementById('w-r-nome').value.trim(),
      raca: document.getElementById('w-r-raca').value.trim(),
      categoria: document.getElementById('w-r-cat').value,
      nascimento: document.getElementById('w-r-nasc').value || null,
      peso: parseFloat(document.getElementById('w-r-peso').value) || null,
      observacoes: document.getElementById('w-r-obs').value.trim()
    });
    ['w-r-id', 'w-r-nome', 'w-r-raca', 'w-r-nasc', 'w-r-peso', 'w-r-obs'].forEach(x => document.getElementById(x).value = '');
    closeSheet('sheet-animal');
    toast('Animal salvo' + (Sync.isOnline() ? ' e enviado!' : ' — será enviado quando conectar.'));
    await Sync.run();
    updatePendingIndicator();
  };

  window.wSavePesagem = async () => {
    const brinco = document.getElementById('w-p-id').value.trim();
    const peso = parseFloat(document.getElementById('w-p-peso').value);
    if (!brinco || !peso) { toast('Informe o brinco e o peso.'); return; }
    await LocalDB.add('pesagens', {
      animal_brinco: brinco,
      peso,
      data: document.getElementById('w-p-data').value || hoje(),
      condicao: document.getElementById('w-p-cc').value,
      observacoes: document.getElementById('w-p-obs').value.trim()
    });
    ['w-p-id', 'w-p-peso', 'w-p-obs'].forEach(x => document.getElementById(x).value = '');
    document.getElementById('w-p-data').value = hoje();
    closeSheet('sheet-pesagem');
    toast('Pesagem salva' + (Sync.isOnline() ? ' e enviada!' : ' — será enviada quando conectar.'));
    await Sync.run();
    updatePendingIndicator();
  };

  window.wSaveSaude = async () => {
    const brinco = document.getElementById('w-s-id').value.trim();
    if (!brinco) { toast('Informe o brinco do animal.'); return; }
    await LocalDB.add('saude', {
      animal_brinco: brinco,
      tipo: document.getElementById('w-s-tipo').value,
      produto: document.getElementById('w-s-desc').value.trim(),
      dose: document.getElementById('w-s-dose').value.trim(),
      data: document.getElementById('w-s-data').value || hoje(),
      proxima_dose: document.getElementById('w-s-prox').value || null,
      observacoes: document.getElementById('w-s-obs').value.trim()
    });
    ['w-s-id', 'w-s-desc', 'w-s-dose', 'w-s-prox', 'w-s-obs'].forEach(x => document.getElementById(x).value = '');
    document.getElementById('w-s-data').value = hoje();
    closeSheet('sheet-saude');
    toast('Procedimento salvo' + (Sync.isOnline() ? ' e enviado!' : ' — será enviado quando conectar.'));
    await Sync.run();
    updatePendingIndicator();
  };

  // ── BOOT ──
  async function boot() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(e => console.log('SW:', e));
    }
    try {
      const data = await api('GET', '/api/me');
      if (data.loggedIn) {
        me = data;
        initApp();
        return;
      }
    } catch (e) { }
    showScreen('login');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
