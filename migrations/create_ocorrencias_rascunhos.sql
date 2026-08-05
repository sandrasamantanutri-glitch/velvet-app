CREATE TABLE IF NOT EXISTS logs_ocorrencias_rascunhos (
  id            SERIAL PRIMARY KEY,
  ocorrencia_id INTEGER NOT NULL REFERENCES logs_ocorrencias(id) ON DELETE CASCADE,
  resposta      TEXT,
  resposta_admin VARCHAR(200),
  status_salvo  VARCHAR(20) NOT NULL DEFAULT 'pendente',
  anexo_base64  TEXT,
  anexo_filename VARCHAR(200),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_rascunhos_ocorrencia ON logs_ocorrencias_rascunhos(ocorrencia_id, criado_em);
