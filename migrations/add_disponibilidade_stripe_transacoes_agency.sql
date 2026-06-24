-- Rastreamento de disponibilidade de saque (Stripe reserve/rolling hold) por transação
ALTER TABLE transacoes_agency
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS disponivel_em TIMESTAMPTZ;

-- Backfill otimista: tudo que já existe é tratado como já disponível,
-- exceto o que formos identificar como cartão ainda represado via sync futuro.
UPDATE transacoes_agency
SET disponivel_em = created_at
WHERE disponivel_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_transacoes_agency_disponivel_em
  ON transacoes_agency (disponivel_em);

CREATE INDEX IF NOT EXISTS idx_transacoes_agency_stripe_pi
  ON transacoes_agency (stripe_payment_intent_id);
