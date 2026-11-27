-- Equipe que atende no chat-agency.html e registro de entrada/saída.
-- O servidor também cria estas tabelas sozinho ao iniciar (utils/chatterSessoes.js).
CREATE TABLE IF NOT EXISTS chatters (
  id            SERIAL PRIMARY KEY,
  codigo        VARCHAR(20) NOT NULL UNIQUE,
  nome          VARCHAR(80) NOT NULL,
  pin_hash      TEXT NOT NULL,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chatter_sessoes (
  id            SERIAL PRIMARY KEY,
  chatter_id    INTEGER NOT NULL REFERENCES chatters(id),
  modelo_id     INTEGER NOT NULL,
  entrou_em     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ultimo_sinal  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  saiu_em       TIMESTAMP WITH TIME ZONE,
  motivo_saida  VARCHAR(20),
  ip            TEXT,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_chatter_sessoes_entrou  ON chatter_sessoes(entrou_em);
CREATE INDEX IF NOT EXISTS idx_chatter_sessoes_chatter ON chatter_sessoes(chatter_id);
CREATE INDEX IF NOT EXISTS idx_chatter_sessoes_abertas ON chatter_sessoes(ultimo_sinal) WHERE saiu_em IS NULL;

-- Como as demais tabelas: sem acesso pela API pública do Supabase
ALTER TABLE chatters        ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatter_sessoes ENABLE ROW LEVEL SECURITY;

-- Quem enviou cada mídia pelo chat (a venda é creditada a essa pessoa)
CREATE TABLE IF NOT EXISTS chatter_envios (
  message_id  INTEGER PRIMARY KEY,
  chatter_id  INTEGER NOT NULL REFERENCES chatters(id),
  sessao_id   INTEGER NOT NULL REFERENCES chatter_sessoes(id),
  modelo_id   INTEGER NOT NULL,
  enviado_em  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatter_envios_chatter ON chatter_envios(chatter_id);
ALTER TABLE chatter_envios ENABLE ROW LEVEL SECURITY;
