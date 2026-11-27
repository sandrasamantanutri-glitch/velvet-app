-- Permite registrar estorno e chargeback em pagamentos_pix (a regra original
-- aceitava só pendente, pago, cancelado, expirado e falhou).
-- Só altera se ainda não foi aplicada, para não travar a tabela a cada início.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pagamentos_pix'::regclass
       AND conname = 'pagamentos_pix_status_check'
       AND pg_get_constraintdef(oid) LIKE '%chargeback%'
  ) THEN
    ALTER TABLE public.pagamentos_pix
      DROP CONSTRAINT IF EXISTS pagamentos_pix_status_check,
      ADD CONSTRAINT pagamentos_pix_status_check CHECK (status IN
        ('pendente', 'pago', 'cancelado', 'expirado', 'falhou', 'estornado', 'chargeback'));
  END IF;
END $$;
