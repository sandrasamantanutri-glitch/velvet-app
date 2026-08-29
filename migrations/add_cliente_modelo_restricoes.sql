CREATE TABLE IF NOT EXISTS cliente_modelo_restricoes (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  modelo_id  INTEGER NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
  motivo     TEXT,
  criado_por INTEGER REFERENCES admin(id),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cliente_id, modelo_id)
);

CREATE INDEX IF NOT EXISTS idx_cmr_cliente ON cliente_modelo_restricoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cmr_modelo  ON cliente_modelo_restricoes(modelo_id);
