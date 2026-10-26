-- Prospecção de modelos (admin). Executar uma vez no banco (Supabase SQL Editor).

CREATE TABLE IF NOT EXISTS prospeccao_perfis (
  id               SERIAL PRIMARY KEY,
  username         TEXT NOT NULL UNIQUE,
  nome             TEXT NOT NULL DEFAULT '',
  bio              TEXT NOT NULL DEFAULT '',
  seguidores       INTEGER NOT NULL DEFAULT 0,
  engajamento      NUMERIC(6,2) NOT NULL DEFAULT 0,
  posts_semana     NUMERIC(5,1) NOT NULL DEFAULT 0,
  categorias       TEXT[] NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'novo',
  prioridade       SMALLINT NOT NULL DEFAULT 0,
  maior_18         BOOLEAN NOT NULL DEFAULT FALSE,
  email            TEXT NOT NULL DEFAULT '',
  telefone         TEXT NOT NULL DEFAULT '',
  notas            TEXT NOT NULL DEFAULT '',
  origem           TEXT NOT NULL DEFAULT '',
  proximo_contato  DATE,
  ultimo_contato   TIMESTAMP WITH TIME ZONE,
  criado_em        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT prospeccao_status_chk CHECK (status IN ('novo','qualificada','contactada','em_conversa','fechada','rejeitada'))
);

CREATE INDEX IF NOT EXISTS idx_prospeccao_status ON prospeccao_perfis(status);

CREATE TABLE IF NOT EXISTS prospeccao_contatos (
  id         SERIAL PRIMARY KEY,
  perfil_id  INTEGER NOT NULL REFERENCES prospeccao_perfis(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL DEFAULT 'dm',
  notas      TEXT NOT NULL DEFAULT '',
  criado_em  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospeccao_contatos_perfil ON prospeccao_contatos(perfil_id);

ALTER TABLE prospeccao_perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccao_contatos ENABLE ROW LEVEL SECURITY;
