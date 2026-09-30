// Contrato de criadores em 3 idiomas (pt / es / en). Em divergência prevalece o português (cláusula 23.5).
const { ptBlocks } = require("./contrato-textos-pt");
const { enBlocks } = require("./contrato-textos-en");
const { esBlocks } = require("./contrato-textos-es");

const IDIOMAS = ["pt", "es", "en"];

const meta = {
  pt: {
    locale: "pt-BR",
    titulo1: "TERMOS E CONDIÇÕES PARA CRIADORES DE CONTEÚDO",
    titulo2: "PLATAFORMA VELVET",
    versao: (data) => `Versão 2.0  |  ${data}`,
    preambulo: "PREÂMBULO",
    declTitulo: "DECLARAÇÃO FINAL DA CRIADORA",
    declIntro: "Ao assinar este contrato eletronicamente, a CRIADORA declara expressamente que:",
    declItens: [
      "I – é maior de 18 anos e realizou o processo de verificação KYC obrigatório;",
      "II – leu, compreendeu e concorda integralmente com todos os termos aqui estabelecidos;",
      "III – atua de forma autônoma e independente, sem vínculo empregatício com a Velvet;",
      "IV – assume responsabilidade integral pelos conteúdos que publicar, incluindo obtenção de consentimento de todos os Participantes;",
      "V – responsabiliza-se exclusivamente por suas obrigações fiscais e tributárias;",
      "VI – reconhece a validade jurídica desta assinatura eletrônica como prova de aceite."
    ],
    cidadeData: (data) => `São Paulo/SP, ${data}.`,
    velvetRep: "Representante Legal: _________________________",
    criadora: "CRIADORA / MODELO / INFLUENCER",
    nome: "Nome", email: "E-mail",
    assinatura: "Assinatura Eletrônica",
    cert: {
      titulo: "CERTIFICADO DE ASSINATURA ELETRÔNICA",
      signataria: "Signatária",
      dataHora: "Data/hora da assinatura (Brasília)",
      ip: "Endereço IP",
      dispositivo: "Dispositivo / navegador",
      modeloId: "ID da modelo na plataforma",
      hash: "Impressão digital (SHA-256) do contrato antes da assinatura",
      idioma: "Idioma do contrato assinado",
      idiomaNome: "Português",
      nota: "Este documento foi assinado eletronicamente por desenho manuscrito na tela, mediante aceite expresso da signatária, com registro de data, hora, IP e dispositivo, nos termos do art. 10, §2º da MP 2.200-2/2001 e da Lei 14.063/2020."
    }
  },
  es: {
    locale: "es-ES",
    titulo1: "TÉRMINOS Y CONDICIONES PARA CREADORES DE CONTENIDO",
    titulo2: "PLATAFORMA VELVET",
    versao: (data) => `Versión 2.0  |  ${data}`,
    preambulo: "PREÁMBULO",
    declTitulo: "DECLARACIÓN FINAL DE LA CREADORA",
    declIntro: "Al firmar este contrato electrónicamente, la CREADORA declara expresamente que:",
    declItens: [
      "I – es mayor de 18 años y ha realizado el proceso obligatorio de verificación KYC;",
      "II – ha leído, comprendido y está plenamente de acuerdo con todos los términos aquí establecidos;",
      "III – actúa de forma autónoma e independiente, sin relación laboral con Velvet;",
      "IV – asume la responsabilidad íntegra por los contenidos que publique, incluida la obtención del consentimiento de todos los Participantes;",
      "V – es exclusivamente responsable de sus obligaciones fiscales y tributarias;",
      "VI – reconoce la validez jurídica de esta firma electrónica como prueba de aceptación."
    ],
    cidadeData: (data) => `São Paulo/SP, ${data}.`,
    velvetRep: "Representante Legal: _________________________",
    criadora: "CREADORA / MODELO / INFLUENCER",
    nome: "Nombre", email: "Correo electrónico",
    assinatura: "Firma Electrónica",
    cert: {
      titulo: "CERTIFICADO DE FIRMA ELECTRÓNICA",
      signataria: "Firmante",
      dataHora: "Fecha y hora de la firma (Brasilia)",
      ip: "Dirección IP",
      dispositivo: "Dispositivo / navegador",
      modeloId: "ID de la modelo en la plataforma",
      hash: "Huella digital (SHA-256) del contrato antes de la firma",
      idioma: "Idioma del contrato firmado",
      idiomaNome: "Español (en caso de divergencia prevalece la versión en portugués)",
      nota: "Este documento fue firmado electrónicamente mediante trazo manuscrito en pantalla, con aceptación expresa de la firmante, con registro de fecha, hora, IP y dispositivo, conforme al art. 10, §2º de la MP 2.200-2/2001 y la Ley 14.063/2020 de Brasil."
    }
  },
  en: {
    locale: "en-GB",
    titulo1: "TERMS AND CONDITIONS FOR CONTENT CREATORS",
    titulo2: "VELVET PLATFORM",
    versao: (data) => `Version 2.0  |  ${data}`,
    preambulo: "PREAMBLE",
    declTitulo: "CREATOR'S FINAL DECLARATION",
    declIntro: "By electronically signing this agreement, the CREATOR expressly declares that:",
    declItens: [
      "I – she/he is over 18 years of age and has completed the mandatory KYC verification process;",
      "II – she/he has read, understood and fully agrees with all the terms set forth herein;",
      "III – she/he acts autonomously and independently, with no employment relationship with Velvet;",
      "IV – she/he assumes full responsibility for the content published, including obtaining the consent of all Participants;",
      "V – she/he is solely responsible for her/his tax obligations;",
      "VI – she/he acknowledges the legal validity of this electronic signature as proof of acceptance."
    ],
    cidadeData: (data) => `São Paulo/SP, Brazil, ${data}.`,
    velvetRep: "Legal Representative: _________________________",
    criadora: "CREATOR / MODEL / INFLUENCER",
    nome: "Name", email: "E-mail",
    assinatura: "Electronic Signature",
    cert: {
      titulo: "ELECTRONIC SIGNATURE CERTIFICATE",
      signataria: "Signatory",
      dataHora: "Signature date/time (Brasília)",
      ip: "IP address",
      dispositivo: "Device / browser",
      modeloId: "Model ID on the platform",
      hash: "Fingerprint (SHA-256) of the contract before signing",
      idioma: "Language of the signed contract",
      idiomaNome: "English (in case of divergence the Portuguese version prevails)",
      nota: "This document was electronically signed by handwritten drawing on screen, with the signatory's express acceptance, recording date, time, IP and device, pursuant to art. 10, §2 of Brazilian Provisional Measure 2.200-2/2001 and Law 14.063/2020."
    }
  }
};

const blocos = { pt: ptBlocks, es: esBlocks, en: enBlocks };

function normalizarIdioma(l) {
  const v = String(l || "").toLowerCase().slice(0, 2);
  return IDIOMAS.includes(v) ? v : "pt";
}

module.exports = { IDIOMAS, meta, blocos, normalizarIdioma };
