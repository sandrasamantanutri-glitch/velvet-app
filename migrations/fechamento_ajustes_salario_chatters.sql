-- Permite o tipo 'salario_chatters' nos ajustes do fechamento mensal
ALTER TABLE fechamento_ajustes DROP CONSTRAINT IF EXISTS fechamento_ajustes_tipo_check,
  ADD CONSTRAINT fechamento_ajustes_tipo_check CHECK (tipo IN ('taxa_gateway','retencao','salario_chatters'));
