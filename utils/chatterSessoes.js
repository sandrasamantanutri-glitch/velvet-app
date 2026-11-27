// Registro de entrada e saída de quem atende no chat-agency.html.
// A presença é medida pelo servidor: enquanto o socket do chat está conectado a
// sessão recebe "sinal"; sem sinal por TOLERANCIA_SEGUNDOS ela é encerrada, com
// a hora de saída igual à do último sinal.
const jwt = require("jsonwebtoken");

const TOLERANCIA_SEGUNDOS = 120;
const INTERVALO_MS = 30 * 1000;
const EVENTO_ENCERRADA = "chatterSessaoEncerrada";

const MIGRACAO = `
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
`;

// O token não leva "id" nem "role", por isso nunca é aceito como login.
function criarToken(sessaoId, userId) {
  return jwt.sign(
    { chatter_sessao: sessaoId, uid: userId },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );
}

// Devolve o id da sessão, ou null se o token não for deste usuário
function lerToken(token, userId) {
  if (!token) return null;
  try {
    const dados = jwt.verify(token, process.env.JWT_SECRET);
    if (!Number.isInteger(dados.chatter_sessao) || dados.uid !== userId) return null;
    return dados.chatter_sessao;
  } catch (_) {
    return null;
  }
}

function criarChatterSessoes(db) {
  const conectados = new Map(); // sessao_id -> Set de sockets

  let pronto = null;
  function migrar() {
    if (!pronto) {
      pronto = db.query(MIGRACAO).catch(err => {
        pronto = null; // tenta de novo na próxima chamada
        throw err;
      });
    }
    return pronto;
  }

  // Há alguém cadastrado? Sem equipe cadastrada o chat não pede identificação.
  async function obrigatorio() {
    await migrar();
    const { rows } = await db.query(
      "SELECT EXISTS(SELECT 1 FROM chatters WHERE ativo) AS existe"
    );
    return rows[0].existe === true;
  }

  async function encerrarInativas() {
    await migrar();
    await db.query(
      `UPDATE chatter_sessoes
          SET saiu_em = ultimo_sinal, motivo_saida = 'desconexao'
        WHERE saiu_em IS NULL
          AND ultimo_sinal < NOW() - make_interval(secs => $1)`,
      [TOLERANCIA_SEGUNDOS]
    );
  }

  // Renova a sessão se ela ainda estiver aberta e dentro da tolerância
  async function renovar(sessaoId) {
    await migrar();
    const { rows } = await db.query(
      `UPDATE chatter_sessoes s
          SET ultimo_sinal = NOW()
         FROM chatters c
        WHERE s.id = $1
          AND c.id = s.chatter_id
          AND c.ativo
          AND s.saiu_em IS NULL
          AND s.ultimo_sinal >= NOW() - make_interval(secs => $2)
      RETURNING s.id, s.entrou_em, c.nome`,
      [sessaoId, TOLERANCIA_SEGUNDOS]
    );
    return rows[0] || null;
  }

  // Abre (ou retoma) a sessão. Pressupõe código e PIN já conferidos.
  async function abrir({ chatterId, modeloId, ip, userAgent }) {
    await encerrarInativas();

    const aberta = await db.query(
      `UPDATE chatter_sessoes
          SET ultimo_sinal = NOW()
        WHERE id = (
          SELECT id FROM chatter_sessoes
           WHERE chatter_id = $1 AND modelo_id = $2 AND saiu_em IS NULL
           ORDER BY entrou_em DESC
           LIMIT 1
        )
      RETURNING id`,
      [chatterId, modeloId]
    );
    if (aberta.rows.length) return aberta.rows[0].id;

    const nova = await db.query(
      `INSERT INTO chatter_sessoes (chatter_id, modelo_id, ip, user_agent)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [chatterId, modeloId, ip || null, String(userAgent || "").slice(0, 300) || null]
    );
    return nova.rows[0].id;
  }

  function avisarEncerradas(ids) {
    for (const id of ids) {
      for (const socket of conectados.get(id) || []) socket.emit(EVENTO_ENCERRADA);
      conectados.delete(id);
    }
  }

  async function sair(sessaoId) {
    await migrar();
    await db.query(
      `UPDATE chatter_sessoes
          SET saiu_em = NOW(), ultimo_sinal = NOW(), motivo_saida = 'botao'
        WHERE id = $1 AND saiu_em IS NULL`,
      [sessaoId]
    );
    avisarEncerradas([sessaoId]);
  }

  // Usado quando o admin desativa alguém ou troca o PIN
  async function encerrarDoChatter(chatterId) {
    await migrar();
    const { rows } = await db.query(
      `UPDATE chatter_sessoes
          SET saiu_em = NOW(), ultimo_sinal = NOW(), motivo_saida = 'admin'
        WHERE chatter_id = $1 AND saiu_em IS NULL
      RETURNING id`,
      [chatterId]
    );
    avisarEncerradas(rows.map(r => r.id));
  }

  async function conectarSocket(socket) {
    const token = socket.handshake.auth?.chatterSessao;
    if (!token || socket.user?.role !== "modelo") return;

    const sessaoId = lerToken(token, socket.user.id);
    if (!sessaoId) {
      socket.emit(EVENTO_ENCERRADA);
      return;
    }

    let desconectado = false;
    socket.on("disconnect", async () => {
      desconectado = true;
      const sockets = conectados.get(sessaoId);
      if (!sockets?.delete(socket) || sockets.size > 0) return;
      conectados.delete(sessaoId);
      try {
        // marca o momento em que a última aba caiu
        await db.query(
          "UPDATE chatter_sessoes SET ultimo_sinal = NOW() WHERE id = $1 AND saiu_em IS NULL",
          [sessaoId]
        );
      } catch (err) {
        console.error("Erro ao registrar desconexão de chatter:", err.message);
      }
    });

    try {
      if (!(await renovar(sessaoId))) {
        socket.emit(EVENTO_ENCERRADA);
        return;
      }
    } catch (err) {
      // falha momentânea do banco: mantém a presença e o próximo ciclo confere
      console.error("Erro ao validar sessão de chatter:", err.message);
    }

    if (desconectado) return;
    if (!conectados.has(sessaoId)) conectados.set(sessaoId, new Set());
    conectados.get(sessaoId).add(socket);
  }

  // Roda a cada INTERVALO_MS: renova quem está conectado e fecha o resto
  async function ciclo() {
    await migrar();
    const ids = [...conectados.keys()];
    if (ids.length) {
      const { rows } = await db.query(
        `UPDATE chatter_sessoes SET ultimo_sinal = NOW()
          WHERE id = ANY($1::int[]) AND saiu_em IS NULL
        RETURNING id`,
        [ids]
      );
      const abertas = new Set(rows.map(r => r.id));
      avisarEncerradas(ids.filter(id => !abertas.has(id)));
    }
    await encerrarInativas();
  }

  function iniciar() {
    migrar().catch(err => console.error("Migração chatters:", err.message));
    setInterval(() => {
      ciclo().catch(err => console.error("Erro no ciclo de chatters:", err.message));
    }, INTERVALO_MS).unref();
  }

  return {
    migrar,
    obrigatorio,
    abrir,
    renovar,
    sair,
    encerrarInativas,
    encerrarDoChatter,
    conectarSocket,
    ciclo,
    iniciar
  };
}

module.exports = criarChatterSessoes;
module.exports.criarToken = criarToken;
module.exports.lerToken = lerToken;
module.exports.TOLERANCIA_SEGUNDOS = TOLERANCIA_SEGUNDOS;
module.exports.MIGRACAO = MIGRACAO;
