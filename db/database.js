const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'fazenda.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vaqueiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    telefone TEXT DEFAULT '',
    senha_hash TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS animais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brinco TEXT UNIQUE NOT NULL,
    nome TEXT DEFAULT '',
    raca TEXT DEFAULT '',
    categoria TEXT DEFAULT 'Vaca',
    nascimento TEXT,
    peso REAL,
    observacoes TEXT DEFAULT '',
    registrado_por INTEGER,
    criado_em TEXT DEFAULT (date('now')),
    sync_id TEXT UNIQUE,
    FOREIGN KEY (registrado_por) REFERENCES vaqueiros(id)
  );

  CREATE TABLE IF NOT EXISTS pesagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_brinco TEXT NOT NULL,
    peso REAL NOT NULL,
    data TEXT NOT NULL,
    condicao_corporal TEXT DEFAULT '3 (ideal)',
    observacoes TEXT DEFAULT '',
    registrado_por INTEGER,
    sync_id TEXT UNIQUE,
    FOREIGN KEY (registrado_por) REFERENCES vaqueiros(id)
  );

  CREATE TABLE IF NOT EXISTS saude (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_brinco TEXT NOT NULL,
    tipo TEXT DEFAULT 'Vacinação',
    produto TEXT DEFAULT '',
    dose TEXT DEFAULT '',
    data TEXT NOT NULL,
    proxima_dose TEXT,
    observacoes TEXT DEFAULT '',
    registrado_por INTEGER,
    sync_id TEXT UNIQUE,
    FOREIGN KEY (registrado_por) REFERENCES vaqueiros(id)
  );

  CREATE TABLE IF NOT EXISTS feed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vaqueiro_id INTEGER,
    tipo TEXT,
    descricao TEXT,
    cor TEXT DEFAULT 'green',
    hora TEXT,
    data TEXT,
    FOREIGN KEY (vaqueiro_id) REFERENCES vaqueiros(id)
  );
`);

const ownerExiste = db.prepare('SELECT id FROM owners WHERE usuario = ?').get('fazenda');
if (!ownerExiste) {
  db.prepare('INSERT INTO owners (usuario, senha_hash) VALUES (?, ?)').run(
    'fazenda', bcrypt.hashSync('1234', 10)
  );
  console.log('Proprietário criado: usuário=fazenda, senha=1234');
}

const vaqExiste = db.prepare('SELECT id FROM vaqueiros WHERE codigo = ?').get('VAQ-001');
if (!vaqExiste) {
  db.prepare('INSERT INTO vaqueiros (codigo, nome, telefone, senha_hash) VALUES (?, ?, ?, ?)').run(
    'VAQ-001', 'João da Silva', '(85) 98765-4321', bcrypt.hashSync('1234', 10)
  );
  console.log('Vaqueiro de exemplo: código=VAQ-001, senha=1234');
}

module.exports = db;
