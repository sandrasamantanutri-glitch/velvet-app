CREATE TABLE IF NOT EXISTS agency_chat_forms (
  id              SERIAL PRIMARY KEY,
  modelo_id       INTEGER NOT NULL UNIQUE,
  agencia_id      INTEGER,
  respostas       JSONB NOT NULL DEFAULT '{}',
  preenchido_em   TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_chat_forms_modelo ON agency_chat_forms(modelo_id);
CREATE INDEX IF NOT EXISTS idx_agency_chat_forms_agencia ON agency_chat_forms(agencia_id);
