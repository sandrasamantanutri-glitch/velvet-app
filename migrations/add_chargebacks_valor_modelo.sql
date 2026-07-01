-- Migração: valor repassado à modelo no chargeback
-- Executar no Supabase SQL Editor

ALTER TABLE chargebacks
  ADD COLUMN IF NOT EXISTS valor_modelo NUMERIC(10,2);

COMMENT ON COLUMN chargebacks.valor_modelo IS 'Parte do valor do chargeback que corresponde ao repasse da modelo (usado no relatório da modelo em vez do valor total da transação)';
