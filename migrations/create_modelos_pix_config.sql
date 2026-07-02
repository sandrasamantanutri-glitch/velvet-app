-- Configuração de PIX habilitado/desabilitado por modelo, por tipo de pagamento
-- Sem registro = PIX liberado por padrão (true) para os 3 tipos
CREATE TABLE IF NOT EXISTS modelos_pix_config (
  modelo_id              INTEGER PRIMARY KEY REFERENCES modelos(id) ON DELETE CASCADE,
  pix_vip                BOOLEAN NOT NULL DEFAULT true,
  pix_vip_primeira_vez   BOOLEAN NOT NULL DEFAULT false,
  pix_chat               BOOLEAN NOT NULL DEFAULT true,
  pix_premium            BOOLEAN NOT NULL DEFAULT true,
  atualizado_por         INTEGER,
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Coluna adicionada após criação inicial:
-- ALTER TABLE modelos_pix_config ADD COLUMN IF NOT EXISTS pix_vip_primeira_vez BOOLEAN NOT NULL DEFAULT false;
