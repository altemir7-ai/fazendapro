const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'fazenda.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    email TEXT DEFAULT '',
    whatsapp TEXT DEFAULT ''
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
    raca TEXT DEFAULT 'Nelore',
    categoria TEXT DEFAULT 'Vaca',
    sexo TEXT DEFAULT 'Femea',
    nascimento TEXT,
    peso REAL,
    pai_brinco TEXT DEFAULT '',
    mae_brinco TEXT DEFAULT '',
    origem TEXT DEFAULT 'Comprado',
    foto TEXT DEFAULT '',
    observacoes TEXT DEFAULT '',
    ativo INTEGER DEFAULT 1,
    registrado_por INTEGER,
    criado_em TEXT DEFAULT (date('now')),
    sync_id TEXT UNIQUE,
    FOREIGN KEY (registrado_por) REFERENCES vaqueiros(id)
  );

  CREATE TABLE IF NOT EXISTS nascimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brinco_bezerro TEXT NOT NULL,
    nome_bezerro TEXT DEFAULT '',
    sexo TEXT DEFAULT 'Femea',
    mae_brinco TEXT NOT NULL,
    pai_brinco TEXT DEFAULT '',
    data_nascimento TEXT NOT NULL,
    peso_nascimento REAL,
    condicao TEXT DEFAULT 'Normal',
    observacoes TEXT DEFAULT '',
    registrado_por INTEGER,
    criado_em TEXT DEFAULT (date('now')),
    sync_id TEXT UNIQUE,
    FOREIGN KEY (registrado_por) REFERENCES vaqueiros(id)
  );

  CREATE TABLE IF NOT EXISTS reproducao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    femea_brinco TEXT NOT NULL,
    tipo TEXT DEFAULT 'Cobertura natural',
    touro_brinco TEXT DEFAULT '',
    semen TEXT DEFAULT '',
    data_evento TEXT NOT NULL,
    resultado TEXT DEFAULT 'Aguardando',
    data_parto_previsto TEXT,
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
    criado_em TEXT DEFAULT (date('now')),
    sync_id TEXT UNIQUE,
    FOREIGN KEY (registrado_por) REFERENCES vaqueiros(id)
  );

  CREATE TABLE IF NOT EXISTS saude (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_brinco TEXT NOT NULL,
    tipo TEXT DEFAULT 'Vacinacao',
    produto TEXT DEFAULT '',
    dose TEXT DEFAULT '',
    data TEXT NOT NULL,
    proxima_dose TEXT,
    custo REAL DEFAULT 0,
    observacoes TEXT DEFAULT '',
    registrado_por INTEGER,
    criado_em TEXT DEFAULT (date('now')),
    sync_id TEXT UNIQUE,
    FOREIGN KEY (registrado_por) REFERENCES vaqueiros(id)
  );

  CREATE TABLE IF NOT EXISTS financeiro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    valor REAL NOT NULL,
    data TEXT NOT NULL,
    animal_brinco TEXT DEFAULT '',
    observacao TEXT DEFAULT '',
    registrado_por INTEGER,
    criado_em TEXT DEFAULT (date('now')),
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

const configs = [
  ['fazenda_nome','Minha Fazenda'],['fazenda_foco','Corte'],
  ['fazenda_raca','Nelore'],['whatsapp_alertas',''],['email_alertas','']
];
const insConf = db.prepare('INSERT OR IGNORE INTO config (chave,valor) VALUES (?,?)');
configs.forEach(([k,v]) => insConf.run(k,v));

if (!db.prepare('SELECT id FROM owners WHERE usuario=?').get('fazenda')) {
  db.prepare('INSERT INTO owners (usuario,senha_hash) VALUES (?,?)').run('fazenda', bcrypt.hashSync('1234',10));
  console.log('Owner criado: fazenda / 1234');
}
if (!db.prepare('SELECT id FROM vaqueiros WHERE codigo=?').get('VAQ-001')) {
  db.prepare('INSERT INTO vaqueiros (codigo,nome,telefone,senha_hash) VALUES (?,?,?,?)').run('VAQ-001','João da Silva','(85) 98765-4321', bcrypt.hashSync('1234',10));
  console.log('Vaqueiro exemplo: VAQ-001 / 1234');
}

module.exports = db;
