// Painel admin: equipe que atende no chat-agency.html e registro de acessos.
// Montado em /api/admin/chatters, atrás de auth + authAdmin.
const express = require("express");
const bcrypt = require("bcrypt");

const FUSO = "America/Sao_Paulo";
const POR_PAGINA = 50;
const REGEX_CODIGO = /^[A-Z0-9_-]{2,20}$/;
const REGEX_PIN = /^\d{4,8}$/;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Datas AAAA-MM-DD, pessoa, modelo e página vindos da query string
function lerFiltros(query) {
  const data = v => (REGEX_DATA.test(v || "") ? v : null);
  const inteiro = v => (/^\d{1,9}$/.test(v || "") ? Number(v) : null);
  return {
    pagina: Math.max(1, inteiro(query.pagina) || 1),
    filtros: [
      data(query.de),
      data(query.ate),
      inteiro(query.chatter_id),
      inteiro(query.modelo_id)
    ]
  };
}

// Soma em centavos para não acumular erro de ponto flutuante
function resumirVendas(rows) {
  const total = { quantidade: 0, centavos: 0 };
  const pessoas = new Map();
  const dias = new Map();

  const somar = (grupo, centavos) => {
    grupo.quantidade += 1;
    grupo.centavos += centavos;
  };
  const grupoDe = (mapa, chave, dados) => {
    if (!mapa.has(chave)) mapa.set(chave, { ...dados, quantidade: 0, centavos: 0 });
    return mapa.get(chave);
  };

  for (const v of rows) {
    const centavos = Math.round(Number(v.valor) * 100);
    const pessoa = {
      chatter_id: v.chatter_id,
      chatter_nome: v.chatter_nome,
      chatter_codigo: v.chatter_codigo
    };
    somar(total, centavos);
    somar(grupoDe(pessoas, v.chatter_id, pessoa), centavos);
    somar(grupoDe(dias, `${v.dia}|${v.chatter_id}|${v.modelo_id}`, {
      ...pessoa, dia: v.dia, modelo_id: v.modelo_id, modelo_nome: v.modelo_nome
    }), centavos);
  }

  const emReais = ({ centavos, ...resto }) => ({ ...resto, valor: centavos / 100 });
  const maiorValor = (a, b) => b.centavos - a.centavos;

  return {
    total: emReais(total),
    por_pessoa: [...pessoas.values()].sort(maiorValor).map(emReais),
    por_dia: [...dias.values()]
      .sort((a, b) => b.dia.localeCompare(a.dia) || maiorValor(a, b))
      .map(emReais)
  };
}

module.exports = function adminChattersRouter(db, sessoes) {
  const router = express.Router();

  router.use(async (req, res, next) => {
    try {
      await sessoes.migrar();
      next();
    } catch (err) {
      console.error("Migração chatters:", err.message);
      res.status(500).json({ erro: "Não foi possível preparar as tabelas." });
    }
  });

  router.get("/", async (req, res) => {
    try {
      await sessoes.encerrarInativas();
      const { rows } = await db.query(
        `SELECT c.id, c.codigo, c.nome, c.ativo, c.criado_em,
                MAX(s.entrou_em) AS ultima_entrada,
                COUNT(s.id) FILTER (WHERE s.saiu_em IS NULL)::int AS sessoes_abertas
           FROM chatters c
           LEFT JOIN chatter_sessoes s ON s.chatter_id = c.id
          GROUP BY c.id
          ORDER BY c.ativo DESC, c.nome`
      );
      res.json({ chatters: rows });
    } catch (err) {
      console.error("Erro ao listar chatters:", err);
      res.status(500).json({ erro: "Erro ao listar a equipe" });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const codigo = String(req.body?.codigo || "").trim().toUpperCase();
      const nome = String(req.body?.nome || "").trim();
      const pin = String(req.body?.pin || "").trim();

      if (!REGEX_CODIGO.test(codigo)) {
        return res.status(400).json({ erro: "Código: 2 a 20 letras, números, - ou _." });
      }
      if (!nome || nome.length > 80) {
        return res.status(400).json({ erro: "Informe o nome (até 80 caracteres)." });
      }
      if (!REGEX_PIN.test(pin)) {
        return res.status(400).json({ erro: "O PIN deve ter de 4 a 8 números." });
      }

      const pinHash = await bcrypt.hash(pin, 10);
      const { rows } = await db.query(
        `INSERT INTO chatters (codigo, nome, pin_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (codigo) DO NOTHING
         RETURNING id, codigo, nome, ativo`,
        [codigo, nome, pinHash]
      );
      if (!rows.length) {
        return res.status(409).json({ erro: "Já existe alguém com esse código." });
      }
      res.json({ chatter: rows[0] });
    } catch (err) {
      console.error("Erro ao criar chatter:", err);
      res.status(500).json({ erro: "Erro ao cadastrar" });
    }
  });

  // Aceita nome, pin e ativo (qualquer combinação)
  router.put("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: "ID inválido" });
      }

      const { nome, pin, ativo } = req.body || {};
      const novoNome = nome === undefined ? null : String(nome).trim();
      const novoPin = pin === undefined || pin === "" ? null : String(pin).trim();
      const novoAtivo = typeof ativo === "boolean" ? ativo : null;

      if (novoNome !== null && (!novoNome || novoNome.length > 80)) {
        return res.status(400).json({ erro: "Informe o nome (até 80 caracteres)." });
      }
      if (novoPin !== null && !REGEX_PIN.test(novoPin)) {
        return res.status(400).json({ erro: "O PIN deve ter de 4 a 8 números." });
      }

      const pinHash = novoPin === null ? null : await bcrypt.hash(novoPin, 10);
      const { rows } = await db.query(
        `UPDATE chatters
            SET nome          = COALESCE($2, nome),
                pin_hash      = COALESCE($3, pin_hash),
                ativo         = COALESCE($4, ativo),
                atualizado_em = NOW()
          WHERE id = $1
        RETURNING id, codigo, nome, ativo`,
        [id, novoNome, pinHash, novoAtivo]
      );
      if (!rows.length) return res.status(404).json({ erro: "Cadastro não encontrado" });

      // Desativar ou trocar o PIN derruba quem estiver usando o código
      if (novoAtivo === false || pinHash) await sessoes.encerrarDoChatter(id);

      res.json({ chatter: rows[0] });
    } catch (err) {
      console.error("Erro ao atualizar chatter:", err);
      res.status(500).json({ erro: "Erro ao atualizar" });
    }
  });

  // Entradas e saídas. Datas (AAAA-MM-DD) no horário de São Paulo; entra na lista
  // toda sessão que esteve aberta em algum momento do período.
  router.get("/sessoes", async (req, res) => {
    try {
      const { filtros, pagina } = lerFiltros(req.query);

      await sessoes.encerrarInativas();

      const { rows } = await db.query(
        `SELECT s.id, s.entrou_em, s.saiu_em, s.motivo_saida,
                c.nome AS chatter_nome, c.codigo AS chatter_codigo,
                s.modelo_id,
                COALESCE(m.nome_exibicao, m.nome) AS modelo_nome,
                EXTRACT(EPOCH FROM (COALESCE(s.saiu_em, NOW()) - s.entrou_em))::int AS duracao_segundos,
                COUNT(*) OVER()::int AS total
           FROM chatter_sessoes s
           JOIN chatters c ON c.id = s.chatter_id
           LEFT JOIN modelos m ON m.id = s.modelo_id
          WHERE ($1::date IS NULL OR COALESCE(s.saiu_em, NOW()) >= ($1::date::timestamp AT TIME ZONE '${FUSO}'))
            AND ($2::date IS NULL OR s.entrou_em < (($2::date + 1)::timestamp AT TIME ZONE '${FUSO}'))
            AND ($3::int IS NULL OR s.chatter_id = $3)
            AND ($4::int IS NULL OR s.modelo_id = $4)
          ORDER BY s.entrou_em DESC
          LIMIT ${POR_PAGINA} OFFSET $5`,
        [...filtros, (pagina - 1) * POR_PAGINA]
      );

      const modelos = await db.query(
        `SELECT DISTINCT s.modelo_id AS id, COALESCE(m.nome_exibicao, m.nome) AS nome
           FROM chatter_sessoes s
           LEFT JOIN modelos m ON m.id = s.modelo_id
          ORDER BY nome`
      );

      const total = rows[0]?.total || 0;
      res.json({
        sessoes: rows,
        modelos: modelos.rows,
        pagina,
        total,
        total_paginas: Math.ceil(total / POR_PAGINA)
      });
    } catch (err) {
      console.error("Erro ao listar sessões de chatters:", err);
      res.status(500).json({ erro: "Erro ao carregar o registro" });
    }
  });

  // Mídias pagas enviadas pela equipe. O dia é o da COMPRA (São Paulo) e o
  // crédito é de quem enviou. Estornos e chargebacks registrados no pagamento
  // ficam de fora; chargeback lançado à mão não aponta a mensagem, só gera alerta.
  router.get("/vendas", async (req, res) => {
    try {
      const { filtros, pagina } = lerFiltros(req.query);

      const { rows } = await db.query(
        `SELECT e.message_id, e.chatter_id, c.nome AS chatter_nome, c.codigo AS chatter_codigo,
                e.modelo_id, COALESCE(mo.nome_exibicao, mo.nome) AS modelo_nome,
                cp.cliente_id, e.enviado_em, cp.pago_em, cp.metodo_pagamento,
                to_char(cp.pago_em AT TIME ZONE '${FUSO}', 'YYYY-MM-DD') AS dia,
                COALESCE(cp.valor_base, cp.preco, msg.preco, 0) AS valor,
                EXISTS (
                  SELECT 1 FROM chargebacks cb
                   WHERE cb.cliente_id = cp.cliente_id AND cb.modelo_id = cp.modelo_id
                     AND cb.tipo = 'midia' AND cb.status = 'ativo'
                ) AS alerta_chargeback
           FROM chatter_envios e
           JOIN chatters c ON c.id = e.chatter_id
           JOIN messages msg ON msg.id = e.message_id
           JOIN conteudo_pacotes cp
             ON cp.message_id = e.message_id
            AND cp.cliente_id = msg.cliente_id
            AND cp.status = 'pago'
           LEFT JOIN modelos mo ON mo.id = e.modelo_id
          WHERE cp.pago_em IS NOT NULL
            AND ($1::date IS NULL OR cp.pago_em >= ($1::date::timestamp AT TIME ZONE '${FUSO}'))
            AND ($2::date IS NULL OR cp.pago_em < (($2::date + 1)::timestamp AT TIME ZONE '${FUSO}'))
            AND ($3::int IS NULL OR e.chatter_id = $3)
            AND ($4::int IS NULL OR e.modelo_id = $4)
            AND NOT EXISTS (
              SELECT 1 FROM pagamentos_pix px
               WHERE px.cliente_id = cp.cliente_id AND px.message_id = cp.message_id
                 AND px.status IN ('estornado', 'chargeback'))
            AND NOT EXISTS (
              SELECT 1 FROM pagamentos_cartao pc
               -- em pagamentos_cartao, conteudo_id guarda o id da mensagem
               WHERE pc.cliente_id = cp.cliente_id AND pc.conteudo_id = cp.message_id
                 AND pc.status IN ('estornado', 'chargeback'))
          ORDER BY cp.pago_em DESC`,
        filtros
      );

      const modelos = await db.query(
        `SELECT DISTINCT e.modelo_id AS id, COALESCE(m.nome_exibicao, m.nome) AS nome
           FROM chatter_envios e
           LEFT JOIN modelos m ON m.id = e.modelo_id
          ORDER BY nome`
      );

      res.json({
        ...resumirVendas(rows),
        vendas: rows.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA),
        modelos: modelos.rows,
        pagina,
        total_paginas: Math.ceil(rows.length / POR_PAGINA)
      });
    } catch (err) {
      console.error("Erro ao listar vendas de chatters:", err);
      res.status(500).json({ erro: "Erro ao carregar as vendas" });
    }
  });

  return router;
};
