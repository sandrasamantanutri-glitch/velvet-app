-- Adiciona token_version na tabela admin para revogação de JWT
-- Executar uma vez no banco de produção

ALTER TABLE admin
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
