-- Tabela de solicitações de saque das modelos
CREATE TABLE IF NOT EXISTS saques (
  id                     SERIAL PRIMARY KEY,
  modelo_id              INTEGER NOT NULL REFERENCES modelos(id),
  valor                  NUMERIC(10,2) NOT NULL,
  chave_pix              TEXT,
  pix_tipo               TEXT,
  banco                  TEXT,
  agencia                TEXT,
  conta                  TEXT,
  conta_tipo             TEXT,
  titular_nome           TEXT,
  titular_documento      TEXT,
  pgto_tipo              TEXT DEFAULT 'pix',  -- 'pix' ou 'transferencia'
  status                 TEXT NOT NULL DEFAULT 'pendente', -- pendente | processando | pago | rejeitado
  motivo_rejeicao        TEXT,
  saldo_disponivel_no_dia NUMERIC(10,2),
  solicitado_em          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processado_em          TIMESTAMP WITH TIME ZONE,
  admin_id               INTEGER,
  recibo_pdf_url         TEXT,    -- PDF gerado pelo sistema
  comprovante_url        TEXT     -- comprovativo de transferência carregado pelo admin
);

CREATE INDEX IF NOT EXISTS idx_saques_modelo_id ON saques(modelo_id);
CREATE INDEX IF NOT EXISTS idx_saques_status    ON saques(status);
