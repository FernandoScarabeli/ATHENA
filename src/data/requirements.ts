export type Requirement = {
  id: string;
  folderId: string;
  title: string;
  type: 'US';
  description: string;
  updatedAt: string;
  owner: string;
  source: string;
  acceptanceCriteria: string[];
  businessRules: string[];
};

const defaultRules = [
  'Todas as ações devem respeitar o perfil e a jurisdição do usuário.',
  'Alterações relevantes devem ser registradas para fins de auditoria.',
];

const coreRequirements: Omit<Requirement, 'folderId'>[] = [
  {
    id: 'emissao-gta',
    title: 'Emissão de GTA',
    type: 'US',
    description: 'Eu, como usuário do sistema, quero gerenciar a emissão de Guias de Trânsito Animal para permitir o trânsito adequado dos animais.',
    updatedAt: 'há 2 dias',
    owner: 'Equipe Trânsito Animal',
    source: 'US-1042 · Google Docs',
    acceptanceCriteria: [
      'O usuário deve selecionar uma espécie.',
      'As finalidades disponíveis devem ser filtradas de acordo com a espécie.',
      'Deve ser informado o produtor responsável.',
      'Quando a procedência for um estabelecimento agropecuário, deve ser selecionada uma exploração pecuária.',
      'Para determinadas espécies, devem ser consideradas informações de vacinação.',
      'A quantidade de animais deve respeitar o saldo disponível na exploração.',
      'O sistema deve calcular e apresentar a taxa antes da confirmação.',
      'Após a confirmação, a GTA deve receber um número único e ficar disponível para impressão.',
    ],
    businessRules: [
      'A exploração de origem precisa estar ativa e vinculada ao produtor informado.',
      'A finalidade deve ser compatível com a espécie, origem e destino do trânsito.',
      'Pendências sanitárias impeditivas devem bloquear a emissão.',
    ],
  },
  {
    id: 'especie', title: 'Espécie', type: 'US', updatedAt: 'há 5 dias', owner: 'Equipe Cadastros', source: 'US-0311 · Google Docs',
    description: 'Como gestor de cadastros, quero manter espécies e grupos de controle para aplicar regras sanitárias consistentes.',
    acceptanceCriteria: ['Permitir classificar espécies por grupo animal.', 'Espécies do grupo Bovídeos possuem controle de rebanho.', 'Manter o status ativo ou inativo da espécie.'], businessRules: defaultRules,
  },
  {
    id: 'produtor', title: 'Produtor', type: 'US', updatedAt: 'há 12 dias', owner: 'Equipe Cadastros', source: 'US-0207 · Google Docs',
    description: 'Como atendente, quero consultar o produtor e seus vínculos para identificar o responsável pelos animais.',
    acceptanceCriteria: ['Localizar produtor por documento ou nome.', 'Exibir estabelecimentos vinculados.', 'Sinalizar cadastros com restrição.'], businessRules: defaultRules,
  },
  {
    id: 'estabelecimento', title: 'Estabelecimento Agropecuário', type: 'US', updatedAt: 'há 8 dias', owner: 'Equipe Cadastros', source: 'US-0288 · Google Docs',
    description: 'Como fiscal, quero manter os dados do estabelecimento agropecuário para registrar a origem e o destino dos animais.',
    acceptanceCriteria: ['Registrar localização e classificação.', 'Vincular responsáveis.', 'Controlar situação cadastral.'], businessRules: defaultRules,
  },
  {
    id: 'exploracao', title: 'Exploração Pecuária', type: 'US', updatedAt: 'há 3 dias', owner: 'Equipe Produção Animal', source: 'US-0418 · Google Docs',
    description: 'Como produtor, quero visualizar minhas explorações e saldos por espécie para movimentar animais de forma regular.',
    acceptanceCriteria: ['Vincular exploração a um estabelecimento.', 'Controlar saldo por espécie.', 'Identificar produtor responsável.'], businessRules: defaultRules,
  },
  {
    id: 'nucleo', title: 'Núcleo de Produção', type: 'US', updatedAt: 'há 21 dias', owner: 'Equipe Produção Animal', source: 'US-0440 · Google Docs',
    description: 'Como gestor, quero organizar explorações em núcleos para acompanhar unidades produtivas relacionadas.',
    acceptanceCriteria: ['Criar núcleo no estabelecimento.', 'Associar explorações.', 'Definir responsável técnico.'], businessRules: defaultRules,
  },
  {
    id: 'vacinacao', title: 'Vacinação', type: 'US', updatedAt: 'há 6 dias', owner: 'Equipe Sanidade', source: 'US-0704 · Google Docs',
    description: 'Como fiscal sanitário, quero consultar declarações de vacinação para validar a regularidade da exploração.',
    acceptanceCriteria: ['Consultar campanhas por espécie.', 'Validar cobertura do rebanho.', 'Exibir pendências sanitárias.'], businessRules: defaultRules,
  },
  {
    id: 'finalidade', title: 'Finalidade de Trânsito', type: 'US', updatedAt: 'há 18 dias', owner: 'Equipe Trânsito Animal', source: 'US-1018 · Google Docs',
    description: 'Como administrador, quero configurar finalidades de trânsito e suas restrições para orientar a emissão da GTA.',
    acceptanceCriteria: ['Relacionar finalidade a espécies.', 'Configurar documentos exigidos.', 'Definir destino permitido.'], businessRules: defaultRules,
  },
  {
    id: 'evento', title: 'Evento Pecuário', type: 'US', updatedAt: 'há 14 dias', owner: 'Equipe Eventos', source: 'US-0835 · Google Docs',
    description: 'Como organizador, quero registrar eventos pecuários para controlar entradas e saídas de animais.',
    acceptanceCriteria: ['Cadastrar período e local.', 'Definir espécies aceitas.', 'Vincular GTAs ao evento.'], businessRules: defaultRules,
  },
  {
    id: 'abatedouro', title: 'Abatedouro Frigorífico', type: 'US', updatedAt: 'há 10 dias', owner: 'Equipe Inspeção', source: 'US-0912 · Google Docs',
    description: 'Como inspetor, quero identificar o abatedouro de destino para rastrear o recebimento e o abate dos animais.',
    acceptanceCriteria: ['Validar registro sanitário.', 'Consultar capacidade operacional.', 'Registrar espécies autorizadas.'], businessRules: defaultRules,
  },
  {
    id: 'doenca', title: 'Doença', type: 'US', updatedAt: 'há 27 dias', owner: 'Equipe Sanidade', source: 'US-0660 · Google Docs',
    description: 'Como gestor sanitário, quero cadastrar doenças e espécies suscetíveis para aplicar medidas de controle.',
    acceptanceCriteria: ['Definir espécies suscetíveis.', 'Configurar medidas de controle.', 'Manter classificação sanitária.'], businessRules: defaultRules,
  },
  {
    id: 'recebimento', title: 'Recebimento de GTA', type: 'US', updatedAt: 'há 4 dias', owner: 'Equipe Trânsito Animal', source: 'US-1070 · Google Docs',
    description: 'Como recebedor, quero confirmar o recebimento de uma GTA para concluir a movimentação dos animais.',
    acceptanceCriteria: ['Localizar GTA válida.', 'Confirmar quantidades recebidas.', 'Atualizar saldo do destino.'], businessRules: defaultRules,
  },
  {
    id: 'cancelamento', title: 'Cancelamento de GTA', type: 'US', updatedAt: 'há 9 dias', owner: 'Equipe Trânsito Animal', source: 'US-1061 · Google Docs',
    description: 'Como emissor, quero cancelar uma GTA ainda não utilizada para corrigir uma movimentação indevida.',
    acceptanceCriteria: ['Validar situação da GTA.', 'Exigir motivo do cancelamento.', 'Estornar saldo e taxa quando aplicável.'], businessRules: defaultRules,
  },
  {
    id: 'taxa', title: 'Taxa de Emissão', type: 'US', updatedAt: 'há 16 dias', owner: 'Equipe Financeiro', source: 'US-1134 · Google Docs',
    description: 'Como usuário, quero consultar a taxa da emissão para conhecer o valor antes de concluir a GTA.',
    acceptanceCriteria: ['Calcular taxa pela finalidade.', 'Exibir memória de cálculo.', 'Registrar situação do pagamento.'], businessRules: defaultRules,
  },
  {
    id: 'pessoa', title: 'Pessoa Física/Jurídica', type: 'US', updatedAt: 'há 25 dias', owner: 'Equipe Cadastros', source: 'US-0110 · Google Docs',
    description: 'Como atendente, quero manter pessoas físicas e jurídicas para reutilizar dados confiáveis nos cadastros do sistema.',
    acceptanceCriteria: ['Validar CPF ou CNPJ.', 'Manter contatos e endereço.', 'Evitar cadastros duplicados.'], businessRules: defaultRules,
  },
];

export type RequirementFolder = {
  id: string;
  title: string;
  description: string;
};

export const requirementFolders: RequirementFolder[] = [
  { id: 'ready-transito', title: 'Ready — Trânsito Animal', description: 'Emissão, recebimento e manutenção de guias' },
  { id: 'ready-rebanho', title: 'Ready — Espécies e Rebanho', description: 'Saldos, espécies e controles produtivos' },
  { id: 'ready-cadastros', title: 'Ready — Pessoas e Cadastros', description: 'Pessoas, produtores e estabelecimentos' },
  { id: 'ready-exploracao', title: 'Ready — Exploração Pecuária', description: 'Estrutura e operação das explorações' },
  { id: 'backlog-sanitario', title: 'Backlog — Controle Sanitário', description: 'Doenças, campanhas e fiscalização' },
  { id: 'backlog-gts', title: 'Backlog — GTS e Transporte', description: 'Transportadores, rotas e autorizações' },
  { id: 'validacao', title: 'Validação', description: 'Histórias aguardando validação de negócio' },
  { id: 'suspensos', title: 'Suspensos', description: 'Itens pausados ou aguardando definição' },
];

const coreFolderById: Record<string, string> = {
  'emissao-gta': 'ready-transito', finalidade: 'ready-transito', recebimento: 'ready-transito', cancelamento: 'ready-transito', evento: 'ready-transito', abatedouro: 'ready-transito', taxa: 'ready-transito',
  especie: 'ready-rebanho', vacinacao: 'ready-rebanho', doenca: 'ready-rebanho',
  produtor: 'ready-cadastros', pessoa: 'ready-cadastros', estabelecimento: 'ready-cadastros',
  exploracao: 'ready-exploracao', nucleo: 'ready-exploracao',
};

const additionalTitles: Record<string, string[]> = {
  'ready-transito': ['Consulta de GTA', 'Impressão de GTA', 'Segunda via de GTA', 'Prorrogação de validade', 'Modelo de guia', 'Histórico de emissões'],
  'ready-rebanho': ['Saldo de rebanho', 'Inventário animal', 'Grupo de espécies', 'Faixa etária animal', 'Movimentação de saldo', 'Ajuste de estoque animal', 'Declaração de rebanho', 'Classificação de animais', 'Controle de lotes', 'Consolidação de saldos'],
  'ready-cadastros': ['Endereço rural', 'Contato do produtor', 'Responsável técnico', 'Documento cadastral', 'Vínculo de propriedade', 'Representante legal', 'Inscrição estadual', 'Município e regional', 'Situação cadastral', 'Histórico de responsáveis'],
  'ready-exploracao': ['Ativação de exploração', 'Inativação de exploração', 'Tipo de exploração', 'Capacidade produtiva', 'Coordenadas da propriedade', 'Unidade produtiva', 'Área de pastagem', 'Responsável pela exploração', 'Consórcio de produtores', 'Transferência de exploração', 'Histórico produtivo'],
  'backlog-sanitario': ['Campanha sanitária', 'Declaração de vacinação', 'Fiscalização sanitária', 'Interdição de propriedade', 'Desinterdição sanitária', 'Foco de doença', 'Notificação compulsória', 'Exame laboratorial', 'Atestado sanitário', 'Calendário de campanha', 'Cobertura vacinal', 'Pendência sanitária'],
  'backlog-gts': ['Guia de Trânsito Sanitário', 'Transportador', 'Veículo de transporte', 'Rota de trânsito', 'Posto de fiscalização', 'Autorização especial', 'Trânsito interestadual', 'Trânsito intraestadual', 'Lacre de carga', 'Responsável pelo transporte', 'Fiscalização em trânsito', 'Chegada ao destino'],
  validacao: ['Importação de cadastros', 'Exportação de relatórios', 'Auditoria de alterações', 'Notificação ao produtor', 'Fila de análise', 'Aprovação por perfil', 'Correção cadastral', 'Duplicidade de pessoa', 'Anexo documental', 'Consulta pública', 'Assinatura digital', 'Histórico de versões'],
  suspensos: ['Integração com laboratório', 'Mapa epidemiológico', 'Aplicativo do produtor', 'Operação sem conexão', 'Leitura de QR Code', 'Importação de GTA externa', 'Painel de indicadores', 'Previsão de campanha', 'Integração financeira', 'Cadastro biométrico', 'Georreferenciamento avançado', 'Portal de eventos'],
};

let generatedIndex = 0;
const generatedRequirements: Requirement[] = Object.entries(additionalTitles).flatMap(([folderId, titles]) => titles.map((title, index) => {
  generatedIndex += 1;
  return {
    id: `mock-${folderId}-${index + 1}`,
    folderId,
    title,
    type: 'US' as const,
    description: `Como usuário do sistema, quero gerenciar ${title.toLocaleLowerCase('pt-BR')} para manter o processo agropecuário rastreável e consistente.`,
    updatedAt: `há ${(generatedIndex % 28) + 1} dias`,
    owner: generatedIndex % 3 === 0 ? 'Equipe Cadastros' : generatedIndex % 3 === 1 ? 'Equipe Operações' : 'Equipe Sanidade',
    source: `US-${String(2000 + generatedIndex).padStart(4, '0')} · Google Docs`,
    acceptanceCriteria: [`Permitir consultar ${title.toLocaleLowerCase('pt-BR')}.`, 'Validar os dados obrigatórios antes da confirmação.', 'Registrar alterações para auditoria.'],
    businessRules: defaultRules,
  };
}));

export const requirements: Requirement[] = [
  ...coreRequirements.map((item) => ({ ...item, folderId: coreFolderById[item.id] })),
  ...generatedRequirements,
];

export const requirementById = Object.fromEntries(requirements.map((item) => [item.id, item])) as Record<string, Requirement>;
