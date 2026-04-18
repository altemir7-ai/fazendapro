const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fazendapro-pwa-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

function authOwner(req, res, next) {
  if (req.session.user && req.session.user.role === 'owner') return next();
  res.status(401).json({ error: 'Acesso não autorizado.' });
}
function authAny(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'Faça login para continuar.' });
}

function addFeed(vaqueiro_id, tipo, descricao, cor) {
  const agora = new Date();
  db.prepare('INSERT INTO feed (vaqueiro_id, tipo, descricao, cor, hora, data) VALUES (?, ?, ?, ?, ?, ?)').run(
    vaqueiro_id, tipo, descricao, cor,
    agora.toTimeString().slice(0, 5),
    agora.toISOString().slice(0, 10)
  );
}

// ── AUTH ──
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, ...req.session.user });
});

app.post('/api/login', (req, res) => {
  const { role, usuario, senha, codigo } = req.body;
  if (role === 'owner') {
    const owner = db.prepare('SELECT * FROM owners WHERE usuario = ?').get(usuario);
    if (!owner || !bcrypt.compareSync(senha, owner.senha_hash))
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    req.session.user = { role: 'owner', nome: 'Proprietário' };
    return res.json({ ok: true, role: 'owner' });
  }
  if (role === 'worker') {
    const w = db.prepare('SELECT * FROM vaqueiros WHERE codigo = ? AND ativo = 1').get(codigo);
    if (!w || !bcrypt.compareSync(senha, w.senha_hash))
      return res.status(401).json({ error: 'Código ou senha incorretos, ou acesso removido.' });
    req.session.user = { role: 'worker', id: w.id, codigo: w.codigo, nome: w.nome };
    return res.json({ ok: true, role: 'worker', id: w.id, nome: w.nome, codigo: w.codigo });
  }
  res.status(400).json({ error: 'Tipo inválido.' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// ── SINCRONIZAÇÃO OFFLINE (rota principal do vaqueiro) ──
app.post('/api/sync', authAny, (req, res) => {
  const { animais = [], pesagens = [], saude = [] } = req.body;
  const workerId = req.session.user.id || null;
  const results = { animais: 0, pesagens: 0, saude: 0, errors: [] };

  const insertAnimal = db.prepare(`
    INSERT OR IGNORE INTO animais (brinco, nome, raca, categoria, nascimento, peso, observacoes, registrado_por, sync_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPesagem = db.prepare(`
    INSERT OR IGNORE INTO pesagens (animal_brinco, peso, data, condicao_corporal, observacoes, registrado_por, sync_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSaude = db.prepare(`
    INSERT OR IGNORE INTO saude (animal_brinco, tipo, produto, dose, data, proxima_dose, observacoes, registrado_por, sync_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const syncAll = db.transaction(() => {
    for (const a of animais) {
      try {
        const info = insertAnimal.run(a.brinco, a.nome||'', a.raca||'', a.categoria||'Vaca', a.nascimento||null, a.peso||null, a.observacoes||'', workerId, a.sync_id);
        if (info.changes > 0) {
          results.animais++;
          if (workerId) addFeed(workerId, 'Animal', `Cadastrou animal ${a.brinco}${a.nome?' ('+a.nome+')':''}`, 'green');
        }
      } catch(e) { results.errors.push('Animal '+a.brinco+': '+e.message); }
    }
    for (const p of pesagens) {
      try {
        const info = insertPesagem.run(p.animal_brinco, p.peso, p.data, p.condicao||'3 (ideal)', p.observacoes||'', workerId, p.sync_id);
        if (info.changes > 0) {
          results.pesagens++;
          if (workerId) addFeed(workerId, 'Pesagem', `Pesou animal ${p.animal_brinco} — ${p.peso} kg`, 'blue');
        }
      } catch(e) { results.errors.push('Pesagem: '+e.message); }
    }
    for (const s of saude) {
      try {
        const info = insertSaude.run(s.animal_brinco, s.tipo||'Vacinação', s.produto||'', s.dose||'', s.data, s.proxima_dose||null, s.observacoes||'', workerId, s.sync_id);
        if (info.changes > 0) {
          results.saude++;
          if (workerId) addFeed(workerId, 'Saúde', `${s.tipo||'Vacinação'} no animal ${s.animal_brinco}`, 'amber');
        }
      } catch(e) { results.errors.push('Saúde: '+e.message); }
    }
  });

  try {
    syncAll();
    res.json({ ok: true, synced: results });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── VAQUEIROS ──
app.get('/api/vaqueiros', authOwner, (req, res) => {
  const rows = db.prepare(`
    SELECT v.id, v.codigo, v.nome, v.telefone, v.ativo, v.criado_em,
      (SELECT COUNT(*) FROM animais WHERE registrado_por = v.id) as total_animais,
      (SELECT COUNT(*) FROM pesagens WHERE registrado_por = v.id) as total_pesagens,
      (SELECT COUNT(*) FROM saude WHERE registrado_por = v.id) as total_saude
    FROM vaqueiros v ORDER BY v.ativo DESC, v.nome
  `).all();
  res.json(rows);
});

app.post('/api/vaqueiros', authOwner, (req, res) => {
  const { nome, telefone, senha } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Informe o nome do vaqueiro.' });
  if (!senha || senha.length < 4) return res.status(400).json({ error: 'A senha deve ter no mínimo 4 caracteres.' });
  // Gera código único mesmo após exclusões
  const max = db.prepare("SELECT MAX(CAST(SUBSTR(codigo,5) AS INTEGER)) as m FROM vaqueiros").get();
  const next = (max.m || 0) + 1;
  const codigo = 'VAQ-' + String(next).padStart(3, '0');
  const hash = bcrypt.hashSync(senha.trim(), 10);
  const info = db.prepare('INSERT INTO vaqueiros (codigo, nome, telefone, senha_hash) VALUES (?, ?, ?, ?)').run(codigo, nome.trim(), telefone||'', hash);
  res.json({ id: info.lastInsertRowid, codigo, nome: nome.trim() });
});

app.patch('/api/vaqueiros/:id/desativar', authOwner, (req, res) => {
  const v = db.prepare('SELECT id FROM vaqueiros WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Vaqueiro não encontrado.' });
  db.prepare('UPDATE vaqueiros SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.patch('/api/vaqueiros/:id/reativar', authOwner, (req, res) => {
  const v = db.prepare('SELECT id FROM vaqueiros WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Vaqueiro não encontrado.' });
  db.prepare('UPDATE vaqueiros SET ativo = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Excluir permanentemente — mantém histórico de registros (registrado_por vira null)
app.delete('/api/vaqueiros/:id', authOwner, (req, res) => {
  const v = db.prepare('SELECT * FROM vaqueiros WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Vaqueiro não encontrado.' });
  const deleteAll = db.transaction(() => {
    db.prepare('UPDATE animais SET registrado_por = NULL WHERE registrado_por = ?').run(v.id);
    db.prepare('UPDATE pesagens SET registrado_por = NULL WHERE registrado_por = ?').run(v.id);
    db.prepare('UPDATE saude SET registrado_por = NULL WHERE registrado_por = ?').run(v.id);
    db.prepare('UPDATE feed SET vaqueiro_id = NULL WHERE vaqueiro_id = ?').run(v.id);
    db.prepare('DELETE FROM vaqueiros WHERE id = ?').run(v.id);
  });
  deleteAll();
  res.json({ ok: true, nome: v.nome, codigo: v.codigo });
});

// Alterar senha do vaqueiro
app.patch('/api/vaqueiros/:id/senha', authOwner, (req, res) => {
  const { senha } = req.body;
  if (!senha || senha.length < 4) return res.status(400).json({ error: 'Senha mínimo 4 caracteres.' });
  db.prepare('UPDATE vaqueiros SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(senha, 10), req.params.id);
  res.json({ ok: true });
});

// Editar dados do vaqueiro
app.patch('/api/vaqueiros/:id/editar', authOwner, (req, res) => {
  const { nome, telefone } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Informe o nome do vaqueiro.' });
  const v = db.prepare('SELECT id FROM vaqueiros WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Vaqueiro não encontrado.' });
  db.prepare('UPDATE vaqueiros SET nome = ?, telefone = ? WHERE id = ?').run(nome.trim(), telefone || '', req.params.id);
  res.json({ ok: true });
});

// ── DADOS PROPRIETÁRIO ──
app.get('/api/animais', authOwner, (req, res) => {
  res.json(db.prepare(`
    SELECT a.*, v.nome as vaqueiro_nome FROM animais a
    LEFT JOIN vaqueiros v ON a.registrado_por = v.id ORDER BY a.id DESC
  `).all());
});

app.get('/api/pesagens', authOwner, (req, res) => {
  res.json(db.prepare(`
    SELECT p.*, v.nome as vaqueiro_nome FROM pesagens p
    LEFT JOIN vaqueiros v ON p.registrado_por = v.id ORDER BY p.data DESC, p.id DESC
  `).all());
});

app.get('/api/saude', authOwner, (req, res) => {
  res.json(db.prepare(`
    SELECT s.*, v.nome as vaqueiro_nome FROM saude s
    LEFT JOIN vaqueiros v ON s.registrado_por = v.id ORDER BY s.data DESC, s.id DESC
  `).all());
});

app.get('/api/feed', authOwner, (req, res) => {
  res.json(db.prepare(`
    SELECT f.*, v.nome as vaqueiro_nome FROM feed f
    LEFT JOIN vaqueiros v ON f.vaqueiro_id = v.id ORDER BY f.id DESC LIMIT 80
  `).all());
});

app.get('/api/dashboard', authOwner, (req, res) => {
  const animais = db.prepare('SELECT COUNT(*) as n FROM animais').get().n;
  const vaqueiros = db.prepare('SELECT COUNT(*) as n FROM vaqueiros WHERE ativo=1').get().n;
  const saude_venc = db.prepare("SELECT COUNT(*) as n FROM saude WHERE proxima_dose < date('now')").get().n;
  const feed = db.prepare(`
    SELECT f.*, v.nome as vaqueiro_nome FROM feed f
    LEFT JOIN vaqueiros v ON f.vaqueiro_id = v.id ORDER BY f.id DESC LIMIT 10
  `).all();
  res.json({ animais, vaqueiros, saude_venc, feed });
});

app.delete('/api/animais/:id', authOwner, (req, res) => {
  db.prepare('DELETE FROM animais WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`FazendaPro PWA rodando na porta ${PORT}`));
