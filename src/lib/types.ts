export type Opportunity = {
  id: string; // numeroControlePNCP
  titulo: string;
  orgao: string;
  uf: string;
  municipio: string;
  modalidade: string;
  modalidadeId: number;
  valor: number | null;
  abertura: string | null;
  encerramento: string | null;
  situacao: string;
  srp: boolean;
  link: string;
};

export const CRM_STAGES = [
  "Nova", "Análise", "Docs", "Preparando", "Participando", "Disputa", "Ganhou", "Perdeu", "Arquivado",
] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

export type Favorito = { id: string; opportunity: Opportunity; created_at: string };

export type CrmCard = {
  id: string;
  titulo: string;
  orgao: string;
  valor: number | null;
  status: CrmStage;
  prazo: string | null;
  opportunity_id: string | null;
  link: string | null;
  notas: string;
  created_at: string;
  updated_at: string;
};

export type RadarProfile = {
  id: string;
  nome: string;
  termos: string[];
  ufs: string[];
  modalidades: number[];
  valor_min: number | null;
  valor_max: number | null;
  ativo: boolean;
  created_at: string;
};

export type Pregao = {
  id: string;
  codigo_compra: string;
  link: string;
  titulo: string;
  status: "Aguardando captura" | "Capturando" | "Encerrado";
  mensagens: number;
  ultima_captura: string | null;
  created_at: string;
  /** Dados do órgão (consultados pela UASG no Compras.gov.br). */
  orgao?: string;
  municipio?: string;
  uf?: string;
  objeto?: string;
};

export type ChatMessage = {
  id: string; // `${codigo_compra}:${chave_origem}`
  codigo_compra: string;
  remetente: string;
  texto: string;
  data_hora: string | null;
  evento: string | null;
  created_at: string;
  /** Número do item a que a mensagem se refere (null = mensagem geral da sessão). */
  item?: string | null;
  /** Campos originais vindos do portal (reduzidos), para reprocessar se o formato mudar. */
  raw?: Record<string, unknown>;
};

export type DadosProposta = {
  endereco: string;
  cidade_uf: string;
  cep: string;
  telefone: string;
  email: string;
  representante: string;
  cpf_representante: string;
  cargo: string;
  banco: string;
  agencia: string;
  conta: string;
};

export type ProvedorIA = "claude" | "gemini";

export type ConfigIA = {
  provedor: ProvedorIA;
  /** Chave da API do Google Gemini (Google AI Studio). Fica nos dados da empresa e vai ao servidor só na hora de usar a IA. */
  gemini_key: string;
  gemini_modelo: string;
};

export type SomAlarme = "sirene" | "bipe" | "campainha";

export type AlertasChat = {
  popup: boolean;
  som: boolean;
  tipo_som: SomAlarme;
  volume: number; // 0 a 1
  repetir: boolean; // toca até silenciar (no máximo 3 min)
  /** Eventos que disparam: "Menção", "Mensagem do pregoeiro" e os eventos de classifyMessage (CONVOCAÇÃO, PRAZO…). */
  eventos: string[];
};

/** Aviso que a extensão deve dar (pop-up e/ou alarme) para uma mensagem nova. */
export type Disparo = { tipo: string; titulo: string; mensagem: string };

export type Alert = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  prioridade: "Alta" | "Média" | "Baixa";
  lido: boolean;
  ref: string | null;
  created_at: string;
};

export type AgendaEvent = {
  id: string;
  titulo: string;
  data: string; // ISO date
  tipo: "Pessoal";
  created_at: string;
};

export type Empresa = {
  id: string;
  razao_social: string;
  cnpj: string;
  ufs: string[];
  produtos: string;
  palavras_chave: string[];
  ingest_key: string;
  /** Como avisar quando chega mensagem relevante no chat (pop-up e alarme sonoro). */
  alertas_chat?: AlertasChat;
  /** Dados que aparecem no cabeçalho e na assinatura das propostas. */
  dados_proposta?: DadosProposta;
  /** Provedor de IA usado nos recursos de inteligência artificial (ex.: análise de edital). */
  ia?: ConfigIA;
  created_at: string;
};

export const TIPOS_DOCUMENTO = [
  "CND Federal (Receita/PGFN)", "CRF FGTS", "CNDT Trabalhista", "CND Estadual", "CND Municipal",
  "Certidão de Falência", "Contrato Social", "Balanço Patrimonial", "Atestado de Capacidade Técnica",
  "Alvará", "Registro em Conselho", "SICAF", "Outro",
] as const;

export type DocumentoEmpresa = {
  id: string;
  tipo: string;
  descricao: string;
  numero: string;
  emissao: string | null; // YYYY-MM-DD
  validade: string | null; // YYYY-MM-DD
  link: string; // onde o arquivo está guardado (Drive, OneDrive…)
  /** PDF enviado para o PEPPACORP (Supabase Storage, bucket "documentos"). */
  arquivo?: { path: string; nome: string; tamanho: number };
  observacao: string;
  created_at: string;
};

/** Resultado da análise de edital por IA (formato definido em lib/edital.ts). */
export type AnaliseEdital = {
  id: string;
  titulo: string;
  fonte: string; // nome do arquivo ou id do PNCP
  pncpId: string | null;
  resultado: import("./edital").ResultadoEdital;
  /** Lotes que a empresa decidiu disputar (nomes como em resultado.itens[].lote). */
  lotes_escolhidos?: string[];
  created_at: string;
};

export const STATUS_PROPOSTA = ["Rascunho", "Em análise", "Pronta para envio", "Enviada", "Homologada", "Recusada"] as const;
export type StatusProposta = (typeof STATUS_PROPOSTA)[number];

export type ItemProposta = {
  /** Sequencial e único na proposta (com lotes, o número do edital se repete entre lotes). */
  numero: number;
  /** Lote do edital (ex.: "LOTE 01 - ELETRODOMÉSTICOS") e o número do item dentro dele. */
  lote?: string;
  numeroEdital?: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  valorEstimado: number | null; // unitário estimado pelo órgão
  precoUnitario: number | null; // nosso preço
  marca: string;
  modelo: string;
  participar: boolean;
  /** Descrição do produto/serviço ofertado (o que vai na proposta, atendendo à descrição do edital). */
  descricaoOfertada?: string;
  /** Preço de referência pesquisado (usado quando o edital não traz valor estimado). */
  valorPesquisado?: number | null;
  pesquisa?: PesquisaItem;
};

/** Valor encontrado em outra licitação parecida no PNCP. */
export type AmostraPreco = {
  pncpId: string; orgao: string; uf: string; data: string | null; descricao: string; unidade: string;
  valor: number; tipo: "estimado" | "homologado"; fornecedor?: string;
};

/** Preço de referência por contratações similares no PNCP. */
export type RefPncp = {
  consulta: string; n: number; mediana: number | null; media: number | null; min: number | null; max: number | null;
  nHomologados: number; medianaHomologada: number | null; amostras: AmostraPreco[];
};

/** Resultado da pesquisa de marcas e preços de um item. */
export type PesquisaItem = {
  em: string;
  pncp?: RefPncp | null;
  /** Pesquisa na internet feita pela IA. */
  mercado?: { preco: number | null; observacao: string } | null;
  marcas?: { marca: string; modelo?: string; observacao?: string }[];
  fontes?: { url: string; titulo: string }[];
};

/** Ponto encontrado na conferência da proposta com IA. */
export type RevisaoProposta = { gravidade: "alta" | "media" | "baixa"; ponto: string; sugestao: string };

export type Proposta = {
  id: string;
  pncpId: string | null;
  /** Análise do edital de onde vieram os itens (análises feitas pelo PDF não têm pncpId). */
  analiseId?: string;
  titulo: string;
  orgao: string;
  orgaoCnpj: string;
  numeroLicitacao: string;
  processo: string;
  modalidade: string;
  encerramento: string | null;
  link: string | null;
  status: StatusProposta;
  validadeDias: number;
  prazoEntrega: string;
  condicoesPagamento: string;
  observacoes: string;
  itens: ItemProposta[];
  localEntrega?: string;
  garantia?: string;
  /** Exigências do edital para a proposta (vindas da análise do edital). */
  exigencias?: string[];
  /** Texto da carta-proposta (gerado com IA e editável). */
  carta?: string;
  revisao?: { em: string; pontos: RevisaoProposta[] };
  created_at: string;
  updated_at: string;
};

export type Collections = {
  favoritos: Favorito;
  crm_cards: CrmCard;
  radar_profiles: RadarProfile;
  pregoes: Pregao;
  chat_messages: ChatMessage;
  alerts: Alert;
  agenda_events: AgendaEvent;
  empresa: Empresa;
  documentos: DocumentoEmpresa;
  analises: AnaliseEdital;
  propostas: Proposta;
};
export type CollectionName = keyof Collections;
