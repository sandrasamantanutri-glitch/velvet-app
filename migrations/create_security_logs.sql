-- Tabela de logs de segurança e atividade de clientes
CREATE TABLE IF NOT EXISTS security_logs (
  id          BIGSERIAL PRIMARY KEY,
  tipo        VARCHAR(100) NOT NULL,
  cliente_id  BIGINT,
  modelo_id   BIGINT,
  descricao   TEXT,
  ip          VARCHAR(100),
  user_agent  VARCHAR(500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_logs_cliente_id ON security_logs(cliente_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_tipo       ON security_logs(tipo);
CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs(created_at DESC);
