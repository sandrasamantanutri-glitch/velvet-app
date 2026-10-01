ALTER TABLE saques ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'modelo'; -- 'modelo' | 'contabilidade'
