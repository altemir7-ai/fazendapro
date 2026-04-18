const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fazendapro-v5-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const authOwner = (req,res,next) => req.session.user?.role==='owner' ? next() : res.status(401).json({error:'Acesso negado.'});
const authAny   = (req,res,next) => req.session.user ? next() : res.status(401).json({error:'Faça login.'});

function addFeed(vaq_id, tipo, desc, cor) {
  const n = new Date();
  db.prepare('INSERT INTO feed (vaqueiro_id,tipo,descricao,cor,hora,data) VALUES (?,?,?,?,?,?)').run(
    vaq_id, tipo, desc, cor,
    n.toTimeString().slice(0,5),
    n.toISOString().slice(0,10)
  );
}

// ── AUTH ──────────────────────────────────────────
app.get('/api/me', (req,res) => res.json(req.session.user ? {loggedIn:true,...req.session.user} : {loggedIn:false}));

app.post('/api/login', (req,res) => {
  const {role,usuario,senha,codigo} = req.body;
  if (role==='owner') {
    const o = db.prepare('SELECT * FROM owners WHERE usuario=?').get(usuario);
    if (!o || !bcrypt.compareSync(senha,o.senha_hash)) return res.status(401).json({error:'Usuário ou senha incorretos.'});
    req.session.user = {role:'owner',nome:'Proprietário'};
    return res.json({ok:true,role:'owner'});
  }
  if (role==='worker') {
    const w = db.prepare('SELECT * FROM vaqueiros WHERE codigo=? AND ativo=1').get(codigo);
    if (!w || !bcrypt.compareSync(senha,w.senha_hash)) return res.status(401).json({error:'Código ou senha incorretos, ou acesso removido.'});
    req.session.user = {role:'worker',id:w.id,codigo:w.codigo,nome:w.nome};
    return res.json({ok:true,role:'worker',id:w.id,nome:w.nome,codigo:w.codigo});
  }
  res.status(400).json({error:'Tipo inválido.'});
});

app.post('/api/logout', (req,res) => { req.session.destroy(); res.json({ok:true}); });

// ── CONFIG ────────────────────────────────────────
app.get('/api/config', authOwner, (req,res) => {
  const rows = db.prepare('SELECT chave,valor FROM config').all();
  const cfg = {};
  rows.forEach(r => cfg[r.chave]=r.valor);
  res.json(cfg);
});

app.patch('/api/config', authOwner, (req,res) => {
  const upd = db.prepare('INSERT OR REPLACE INTO config (chave,valor) VALUES (?,?)');
  const tx = db.transaction(() => Object.entries(req.body).forEach(([k,v]) => upd.run(k,v)));
  tx();
  res.json({ok:true});
});

app.patch('/api/owner/senha', authOwner, (req,res) => {
  const {senha_atual, senha_nova} = req.body;
  const o = db.prepare('SELECT * FROM owners LIMIT 1').get();
  if (!bcrypt.compareSync(senha_atual, o.senha_hash)) return res.status(401).json({error:'Senha atual incorreta.'});
  if (!senha_nova || senha_nova.length < 4) return res.status(400).json({error:'Nova senha muito curta.'});
  db.prepare('UPDATE owners SET senha_hash=? WHERE id=?').run(bcrypt.hashSync(senha_nova,10), o.id);
  res.json({ok:true});
});

// ── VAQUEIROS ─────────────────────────────────────
app.get('/api/vaqueiros', authOwner, (req,res) => {
  res.json(db.prepare(`
    SELECT v.*,
      (SELECT COUNT(*) FROM animais WHERE registrado_por=v.id) as tot_animais,
      (SELECT COUNT(*) FROM pesagens WHERE registrado_por=v.id) as tot_pesagens,
      (SELECT COUNT(*) FROM saude WHERE registrado_por=v.id) as tot_saude,
      (SELECT COUNT(*) FROM nascimentos WHERE registrado_por=v.id) as tot_nascimentos
    FROM vaqueiros v ORDER BY v.ativo DESC, v.nome
  `).all());
});

app.post('/api/vaqueiros', authOwner, (req,res) => {
  const {nome,telefone,senha} = req.body;
  if (!nome?.trim()) return res.status(400).json({error:'Informe o nome.'});
  if (!senha || senha.length<4) return res.status(400).json({error:'Senha mínimo 4 caracteres.'});
  const max = db.prepare("SELECT MAX(CAST(SUBSTR(codigo,5) AS INTEGER)) as m FROM vaqueiros").get();
  const codigo = 'VAQ-'+String((max.m||0)+1).padStart(3,'0');
  const info = db.prepare('INSERT INTO vaqueiros (codigo,nome,telefone,senha_hash) VALUES (?,?,?,?)').run(codigo,nome.trim(),telefone||'',bcrypt.hashSync(senha,10));
  res.json({id:info.lastInsertRowid,codigo,nome:nome.trim()});
});

app.patch('/api/vaqueiros/:id/editar', authOwner, (req,res) => {
  const {nome,telefone} = req.body;
  if (!nome?.trim()) return res.status(400).json({error:'Informe o nome.'});
  db.prepare('UPDATE vaqueiros SET nome=?,telefone=? WHERE id=?').run(nome.trim(),telefone||'',req.params.id);
  res.json({ok:true});
});

app.patch('/api/vaqueiros/:id/senha', authOwner, (req,res) => {
  const {senha} = req.body;
  if (!senha||senha.length<4) return res.status(400).json({error:'Senha mínimo 4 caracteres.'});
  db.prepare('UPDATE vaqueiros SET senha_hash=? WHERE id=?').run(bcrypt.hashSync(senha,10),req.params.id);
  res.json({ok:true});
});

app.patch('/api/vaqueiros/:id/desativar', authOwner, (req,res) => {
  db.prepare('UPDATE vaqueiros SET ativo=0 WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.patch('/api/vaqueiros/:id/reativar', authOwner, (req,res) => {
  db.prepare('UPDATE vaqueiros SET ativo=1 WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.delete('/api/vaqueiros/:id', authOwner, (req,res) => {
  const v = db.prepare('SELECT * FROM vaqueiros WHERE id=?').get(req.params.id);
  if (!v) return res.status(404).json({error:'Não encontrado.'});
  db.transaction(() => {
    ['animais','pesagens','saude','nascimentos','reproducao','financeiro'].forEach(t =>
      db.prepare(`UPDATE ${t} SET registrado_por=NULL WHERE registrado_por=?`).run(v.id)
    );
    db.prepare('UPDATE feed SET vaqueiro_id=NULL WHERE vaqueiro_id=?').run(v.id);
    db.prepare('DELETE FROM vaqueiros WHERE id=?').run(v.id);
  })();
  res.json({ok:true});
});

// ── SYNC OFFLINE ──────────────────────────────────
app.post('/api/sync', authAny, (req,res) => {
  const {animais=[],pesagens=[],saude=[],nascimentos=[],reproducao=[]} = req.body;
  const wId = req.session.user.role==='worker' ? req.session.user.id : null;
  const r = {animais:0,pesagens:0,saude:0,nascimentos:0,reproducao:0,errors:[]};

  const insAnimal = db.prepare('INSERT OR IGNORE INTO animais (brinco,nome,raca,categoria,sexo,nascimento,peso,pai_brinco,mae_brinco,origem,foto,observacoes,registrado_por,sync_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insPesagem = db.prepare('INSERT OR IGNORE INTO pesagens (animal_brinco,peso,data,condicao_corporal,observacoes,registrado_por,sync_id) VALUES (?,?,?,?,?,?,?)');
  const insSaude = db.prepare('INSERT OR IGNORE INTO saude (animal_brinco,tipo,produto,dose,data,proxima_dose,custo,observacoes,registrado_por,sync_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insNasc = db.prepare('INSERT OR IGNORE INTO nascimentos (brinco_bezerro,nome_bezerro,sexo,mae_brinco,pai_brinco,data_nascimento,peso_nascimento,condicao,observacoes,registrado_por,sync_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const insRepro = db.prepare('INSERT OR IGNORE INTO reproducao (femea_brinco,tipo,touro_brinco,semen,data_evento,resultado,data_parto_previsto,observacoes,registrado_por,sync_id) VALUES (?,?,?,?,?,?,?,?,?,?)');

  db.transaction(() => {
    for (const a of animais) {
      try {
        const i = insAnimal.run(a.brinco,a.nome||'',a.raca||'Nelore',a.categoria||'Vaca',a.sexo||'Femea',a.nascimento||null,a.peso||null,a.pai_brinco||'',a.mae_brinco||'',a.origem||'Nascido na fazenda',a.foto||'',a.observacoes||'',wId,a.sync_id);
        if (i.changes>0) { r.animais++; wId&&addFeed(wId,'Animal',`Cadastrou animal ${a.brinco}${a.nome?' ('+a.nome+')':''}`, 'green'); }
      } catch(e) { r.errors.push(e.message); }
    }
    for (const p of pesagens) {
      try {
        const i = insPesagem.run(p.animal_brinco,p.peso,p.data,p.condicao||'3 (ideal)',p.observacoes||'',wId,p.sync_id);
        if (i.changes>0) { r.pesagens++; wId&&addFeed(wId,'Pesagem',`Pesou ${p.animal_brinco} — ${p.peso} kg`,'blue'); }
      } catch(e) { r.errors.push(e.message); }
    }
    for (const s of saude) {
      try {
        const i = insSaude.run(s.animal_brinco,s.tipo||'Vacinacao',s.produto||'',s.dose||'',s.data,s.proxima_dose||null,s.custo||0,s.observacoes||'',wId,s.sync_id);
        if (i.changes>0) { r.saude++; wId&&addFeed(wId,'Saúde',`${s.tipo} em ${s.animal_brinco}`,'amber'); }
      } catch(e) { r.errors.push(e.message); }
    }
    for (const n of nascimentos) {
      try {
        const i = insNasc.run(n.brinco_bezerro,n.nome_bezerro||'',n.sexo||'Femea',n.mae_brinco,n.pai_brinco||'',n.data_nascimento,n.peso_nascimento||null,n.condicao||'Normal',n.observacoes||'',wId,n.sync_id);
        if (i.changes>0) {
          r.nascimentos++;
          // Criar animal automaticamente
          db.prepare('INSERT OR IGNORE INTO animais (brinco,nome,raca,categoria,sexo,nascimento,peso,mae_brinco,pai_brinco,origem,registrado_por,sync_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
            n.brinco_bezerro,n.nome_bezerro||'',n.raca||'Nelore',
            n.sexo==='Macho'?'Bezerro':'Bezerra',
            n.sexo||'Femea',n.data_nascimento,n.peso_nascimento||null,
            n.mae_brinco,n.pai_brinco||'','Nascido na fazenda',wId,n.sync_id+'_a'
          );
          wId&&addFeed(wId,'Nascimento',`Nascimento registrado — bezerro ${n.brinco_bezerro}`,'green');
        }
      } catch(e) { r.errors.push(e.message); }
    }
    for (const rp of reproducao) {
      try {
        const i = insRepro.run(rp.femea_brinco,rp.tipo||'Cobertura natural',rp.touro_brinco||'',rp.semen||'',rp.data_evento,rp.resultado||'Aguardando',rp.data_parto_previsto||null,rp.observacoes||'',wId,rp.sync_id);
        if (i.changes>0) { r.reproducao++; wId&&addFeed(wId,'Reprodução',`${rp.tipo} — fêmea ${rp.femea_brinco}`,'teal'); }
      } catch(e) { r.errors.push(e.message); }
    }
  })();

  res.json({ok:true,synced:r});
});

// ── ANIMAIS ───────────────────────────────────────
app.get('/api/animais', authOwner, (req,res) => {
  res.json(db.prepare(`SELECT a.*,v.nome as vaqueiro_nome FROM animais a LEFT JOIN vaqueiros v ON a.registrado_por=v.id WHERE a.ativo=1 ORDER BY a.id DESC`).all());
});

app.delete('/api/animais/:id', authOwner, (req,res) => {
  db.prepare('UPDATE animais SET ativo=0 WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ── NASCIMENTOS ───────────────────────────────────
app.get('/api/nascimentos', authOwner, (req,res) => {
  res.json(db.prepare(`SELECT n.*,v.nome as vaqueiro_nome FROM nascimentos n LEFT JOIN vaqueiros v ON n.registrado_por=v.id ORDER BY n.data_nascimento DESC`).all());
});

// ── REPRODUÇÃO ────────────────────────────────────
app.get('/api/reproducao', authOwner, (req,res) => {
  res.json(db.prepare(`SELECT r.*,v.nome as vaqueiro_nome FROM reproducao r LEFT JOIN vaqueiros v ON r.registrado_por=v.id ORDER BY r.data_evento DESC`).all());
});

// ── PESAGENS ──────────────────────────────────────
app.get('/api/pesagens', authOwner, (req,res) => {
  res.json(db.prepare(`SELECT p.*,v.nome as vaqueiro_nome FROM pesagens p LEFT JOIN vaqueiros v ON p.registrado_por=v.id ORDER BY p.data DESC`).all());
});

// ── SAÚDE ─────────────────────────────────────────
app.get('/api/saude', authOwner, (req,res) => {
  res.json(db.prepare(`SELECT s.*,v.nome as vaqueiro_nome FROM saude s LEFT JOIN vaqueiros v ON s.registrado_por=v.id ORDER BY s.data DESC`).all());
});

// ── FINANCEIRO ────────────────────────────────────
app.get('/api/financeiro', authOwner, (req,res) => {
  res.json(db.prepare(`SELECT f.*,v.nome as vaqueiro_nome FROM financeiro f LEFT JOIN vaqueiros v ON f.registrado_por=v.id ORDER BY f.data DESC`).all());
});

app.post('/api/financeiro', authAny, (req,res) => {
  const {tipo,categoria,valor,data,animal_brinco,observacao} = req.body;
  if (!valor||valor<=0) return res.status(400).json({error:'Valor inválido.'});
  const wId = req.session.user.role==='worker' ? req.session.user.id : null;
  db.prepare('INSERT INTO financeiro (tipo,categoria,valor,data,animal_brinco,observacao,registrado_por) VALUES (?,?,?,?,?,?,?)').run(tipo||'entrada',categoria||'Outro',valor,data||new Date().toISOString().slice(0,10),animal_brinco||'',observacao||'',wId);
  if (wId) addFeed(wId,'Financeiro',`${tipo==='saida'?'Saída':'Entrada'}: ${categoria} R$${Number(valor).toFixed(2)}`,'red');
  res.json({ok:true});
});

// ── DASHBOARD ─────────────────────────────────────
app.get('/api/dashboard', authOwner, (req,res) => {
  const animais  = db.prepare("SELECT COUNT(*) as n FROM animais WHERE ativo=1").get().n;
  const vaqueiros= db.prepare("SELECT COUNT(*) as n FROM vaqueiros WHERE ativo=1").get().n;
  const nasc_mes = db.prepare("SELECT COUNT(*) as n FROM nascimentos WHERE strftime('%Y-%m',data_nascimento)=strftime('%Y-%m','now')").get().n;
  const saude_venc= db.prepare("SELECT COUNT(*) as n FROM saude WHERE proxima_dose<date('now') AND proxima_dose!=''").get().n;
  const gestantes= db.prepare("SELECT COUNT(*) as n FROM reproducao WHERE resultado='Positivo' AND (data_parto_previsto IS NULL OR data_parto_previsto>=date('now'))").get().n;
  const ent = db.prepare("SELECT COALESCE(SUM(valor),0) as s FROM financeiro WHERE tipo='entrada'").get().s;
  const sai = db.prepare("SELECT COALESCE(SUM(valor),0) as s FROM financeiro WHERE tipo='saida'").get().s;
  const feed = db.prepare("SELECT f.*,v.nome as vaqueiro_nome FROM feed f LEFT JOIN vaqueiros v ON f.vaqueiro_id=v.id ORDER BY f.id DESC LIMIT 15").all();
  const alertas_saude = db.prepare("SELECT s.*,a.nome as animal_nome FROM saude s LEFT JOIN animais a ON s.animal_brinco=a.brinco WHERE s.proxima_dose!='' AND s.proxima_dose<=date('now','+30 days') ORDER BY s.proxima_dose LIMIT 10").all();
  const partos_prox = db.prepare("SELECT r.*,a.nome as animal_nome FROM reproducao r LEFT JOIN animais a ON r.femea_brinco=a.brinco WHERE r.resultado='Positivo' AND r.data_parto_previsto>=date('now') ORDER BY r.data_parto_previsto LIMIT 5").all();
  const cfg = {};
  db.prepare('SELECT chave,valor FROM config').all().forEach(r => cfg[r.chave]=r.valor);
  res.json({animais,vaqueiros,nasc_mes,saude_venc,gestantes,saldo:ent-sai,feed,alertas_saude,partos_prox,config:cfg});
});

// ── FEED ──────────────────────────────────────────
app.get('/api/feed', authOwner, (req,res) => {
  res.json(db.prepare("SELECT f.*,v.nome as vaqueiro_nome FROM feed f LEFT JOIN vaqueiros v ON f.vaqueiro_id=v.id ORDER BY f.id DESC LIMIT 100").all());
});

// ── RELATÓRIO PDF ─────────────────────────────────
app.get('/api/relatorio/pdf', authOwner, (req,res) => {
  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({margin:50});
    const cfg = {};
    db.prepare('SELECT chave,valor FROM config').all().forEach(r => cfg[r.chave]=r.valor);
    const animais = db.prepare("SELECT * FROM animais WHERE ativo=1").all();
    const nascimentos = db.prepare("SELECT * FROM nascimentos ORDER BY data_nascimento DESC LIMIT 20").all();
    const saude = db.prepare("SELECT * FROM saude ORDER BY data DESC LIMIT 20").all();
    const ent = db.prepare("SELECT COALESCE(SUM(valor),0) as s FROM financeiro WHERE tipo='entrada'").get().s;
    const sai = db.prepare("SELECT COALESCE(SUM(valor),0) as s FROM financeiro WHERE tipo='saida'").get().s;

    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename=fazendapro-relatorio-${new Date().toISOString().slice(0,10)}.pdf`);
    doc.pipe(res);

    // Cabeçalho
    doc.fontSize(22).fillColor('#0F6E56').text(cfg.fazenda_nome||'FazendaPro', {align:'center'});
    doc.fontSize(12).fillColor('#666').text(`Relatório gerado em ${new Date().toLocaleDateString('pt-BR')}`, {align:'center'});
    doc.moveDown(2);

    // Resumo
    doc.fontSize(16).fillColor('#1a1a1a').text('Resumo do rebanho');
    doc.moveTo(50,doc.y).lineTo(545,doc.y).strokeColor('#0F6E56').stroke();
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#333');
    doc.text(`Total de animais ativos: ${animais.length}`);
    doc.text(`Nascimentos este mês: ${nascimentos.filter(n=>n.data_nascimento>=new Date().toISOString().slice(0,7)).length}`);
    doc.text(`Saldo financeiro: R$ ${(ent-sai).toLocaleString('pt-BR',{minimumFractionDigits:2})}`);
    doc.moveDown(1.5);

    // Animais
    doc.fontSize(16).fillColor('#1a1a1a').text('Rebanho');
    doc.moveTo(50,doc.y).lineTo(545,doc.y).strokeColor('#0F6E56').stroke();
    doc.moveDown(0.5);
    animais.slice(0,30).forEach(a => {
      doc.fontSize(11).fillColor('#333').text(`${a.brinco}  ${a.nome||''}  ${a.categoria}  ${a.raca}  ${a.peso?a.peso+' kg':''}`);
    });
    doc.moveDown(1.5);

    // Nascimentos
    if (nascimentos.length) {
      doc.fontSize(16).fillColor('#1a1a1a').text('Últimos nascimentos');
      doc.moveTo(50,doc.y).lineTo(545,doc.y).strokeColor('#0F6E56').stroke();
      doc.moveDown(0.5);
      nascimentos.slice(0,15).forEach(n => {
        doc.fontSize(11).fillColor('#333').text(`${n.data_nascimento}  Bezerro: ${n.brinco_bezerro}  Mãe: ${n.mae_brinco}  ${n.sexo}  ${n.peso_nascimento?n.peso_nascimento+' kg':''}`);
      });
      doc.moveDown(1.5);
    }

    // Saúde
    if (saude.length) {
      doc.fontSize(16).fillColor('#1a1a1a').text('Últimos procedimentos de saúde');
      doc.moveTo(50,doc.y).lineTo(545,doc.y).strokeColor('#0F6E56').stroke();
      doc.moveDown(0.5);
      saude.slice(0,15).forEach(s => {
        doc.fontSize(11).fillColor('#333').text(`${s.data}  ${s.animal_brinco}  ${s.tipo}  ${s.produto}${s.proxima_dose?'  Próx: '+s.proxima_dose:''}`);
      });
    }

    doc.end();
  } catch(e) {
    res.status(500).json({error:'Erro ao gerar PDF: '+e.message});
  }
});

// ── RELATÓRIO EXCEL (CSV) ─────────────────────────
app.get('/api/relatorio/csv/:tabela', authOwner, (req,res) => {
  const tabelas = {
    animais: 'SELECT brinco,nome,raca,categoria,sexo,nascimento,peso,origem,mae_brinco,pai_brinco,observacoes,criado_em FROM animais WHERE ativo=1',
    nascimentos: 'SELECT brinco_bezerro,nome_bezerro,sexo,mae_brinco,pai_brinco,data_nascimento,peso_nascimento,condicao,observacoes FROM nascimentos',
    saude: 'SELECT animal_brinco,tipo,produto,dose,data,proxima_dose,custo,observacoes FROM saude ORDER BY data DESC',
    pesagens: 'SELECT animal_brinco,peso,data,condicao_corporal,observacoes FROM pesagens ORDER BY data DESC',
    financeiro: 'SELECT tipo,categoria,valor,data,animal_brinco,observacao FROM financeiro ORDER BY data DESC'
  };
  const query = tabelas[req.params.tabela];
  if (!query) return res.status(400).json({error:'Tabela inválida.'});
  const rows = db.prepare(query).all();
  if (!rows.length) return res.status(404).json({error:'Sem dados.'});
  const headers = Object.keys(rows[0]).join(';');
  const lines = rows.map(r => Object.values(r).map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(';'));
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename=fazendapro-${req.params.tabela}-${new Date().toISOString().slice(0,10)}.csv`);
  res.send('\uFEFF'+headers+'\n'+lines.join('\n'));
});

// ── ALERTA WHATSAPP (via wa.me link) ─────────────
app.get('/api/alertas/whatsapp', authOwner, (req,res) => {
  const vencidos = db.prepare("SELECT s.*,a.nome as animal_nome FROM saude s LEFT JOIN animais a ON s.animal_brinco=a.brinco WHERE s.proxima_dose<date('now') AND s.proxima_dose!=''").all();
  const cfg = {};
  db.prepare('SELECT chave,valor FROM config').all().forEach(r=>cfg[r.chave]=r.valor);
  if (!vencidos.length) return res.json({ok:true,msg:'Nenhum procedimento vencido.'});
  const linhas = vencidos.map(v=>`• Animal ${v.animal_brinco}${v.animal_nome?' ('+v.animal_nome+')':''}: ${v.tipo} — ${v.produto} (venceu ${v.proxima_dose})`).join('\n');
  const texto = encodeURIComponent(`🐄 *FazendaPro — Alertas de saúde*\n\nOs seguintes procedimentos estão vencidos:\n\n${linhas}\n\nAcesse o sistema para registrar os procedimentos.`);
  const numero = (cfg.whatsapp_alertas||'').replace(/\D/g,'');
  res.json({ok:true,url:`https://wa.me/${numero}?text=${texto}`,count:vencidos.length});
});

app.listen(PORT, () => console.log(`FazendaPro v5 rodando na porta ${PORT}`));
