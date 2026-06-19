function podeAlterarDadosBancarios() {
  const hoje = new Date();
  const dia = hoje.getDate();

  // bloqueia do dia 1 ao 5 (janela de processamento de pagamentos)
  return !(dia >= 1 && dia <= 5);
}

module.exports = { podeAlterarDadosBancarios };
