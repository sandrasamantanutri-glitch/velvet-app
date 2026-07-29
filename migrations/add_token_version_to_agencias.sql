-- Adiciona token_version na tabela agencias para revogação de JWT
-- Executar uma vez no banco de produção

ALTER TABLE agencias
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
