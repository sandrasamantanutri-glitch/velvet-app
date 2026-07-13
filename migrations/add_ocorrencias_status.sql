-- Adiciona campos de status e resposta à tabela logs_ocorrencias
ALTER TABLE logs_ocorrencias
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'aberta',
  ADD COLUMN IF NOT EXISTS resposta TEXT,
  ADD COLUMN IF NOT EXISTS resposta_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resposta_admin VARCHAR(200),
  ADD COLUMN IF NOT EXISTS anexo_resposta_base64 TEXT,
  ADD COLUMN IF NOT EXISTS anexo_resposta_filename VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_logs_ocorrencias_cliente_id ON logs_ocorrencias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_logs_ocorrencias_status     ON logs_ocorrencias(status);
CREATE INDEX IF NOT EXISTS idx_logs_ocorrencias_created_at ON logs_ocorrencias(created_at DESC);
