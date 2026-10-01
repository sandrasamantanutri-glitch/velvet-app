ALTER TABLE saques ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'modelo'; -- 'modelo' | 'contabilidade'
ALTER TABLE saques ADD COLUMN IF NOT EXISTS mes_referencia DATE; -- mês que o saque da contabilidade fecha
