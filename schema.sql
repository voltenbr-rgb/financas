-- Schema do Cloudflare D1 "Banco Volten"
-- Datas de clientes: texto ISO local (YYYY-MM-DDTHH:MM). Datas de finanças: YYYY-MM-DD.

CREATE TABLE IF NOT EXISTS clientes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario         TEXT NOT NULL,
  senha           TEXT NOT NULL,
  url_dns         TEXT NOT NULL DEFAULT '',
  data_criacao    TEXT NOT NULL DEFAULT '',
  data_vencimento TEXT NOT NULL DEFAULT '',
  criado_em       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clientes_vencimento ON clientes (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_clientes_usuario_url ON clientes (usuario, url_dns);

CREATE TABLE IF NOT EXISTS financas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao       TEXT NOT NULL,
  valor           REAL NOT NULL CHECK (valor > 0),
  categoria       TEXT NOT NULL DEFAULT 'Outros',
  tipo            TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  data_vencimento TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pago', 'pendente')),
  criado_em       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_financas_vencimento ON financas (data_vencimento);
