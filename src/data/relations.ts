import { requirements } from './requirements';

export type RelationType = 'DEPENDE DE' | 'USA DADOS DE' | 'USA REGRA DE' | 'FORNECE DADOS PARA' | 'RELACIONADO A';

export type Relation = {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  confidence: number;
  reason: string;
  evidence: string;
};

const relation = (source: string, target: string, type: RelationType, confidence: number, reason: string, evidence: string): Relation => ({
  id: `${source}-${target}`,
  source,
  target,
  type,
  confidence,
  reason,
  evidence,
});

const coreRelations: Relation[] = [
  relation('emissao-gta', 'especie', 'DEPENDE DE', 94, 'A emissão utiliza a espécie selecionada para determinar regras e opções disponíveis durante o preenchimento.', 'As finalidades disponíveis devem ser filtradas de acordo com a espécie selecionada.'),
  relation('emissao-gta', 'finalidade', 'DEPENDE DE', 92, 'A finalidade determina regras obrigatórias para a emissão.', 'O usuário deve selecionar uma finalidade compatível com a espécie.'),
  relation('emissao-gta', 'produtor', 'USA DADOS DE', 91, 'A emissão precisa identificar o responsável pelos animais.', 'Deve ser informado o produtor responsável.'),
  relation('emissao-gta', 'exploracao', 'DEPENDE DE', 96, 'O saldo e a origem dos animais são obtidos da exploração pecuária.', 'A quantidade de animais deve respeitar o saldo disponível na exploração.'),
  relation('emissao-gta', 'vacinacao', 'USA REGRA DE', 89, 'Algumas espécies exigem situação vacinal regular para autorizar o trânsito.', 'Para determinadas espécies, devem ser consideradas informações de vacinação.'),
  relation('emissao-gta', 'taxa', 'USA REGRA DE', 87, 'A emissão calcula a cobrança aplicável antes da confirmação.', 'O sistema deve calcular e apresentar a taxa antes da confirmação.'),
  relation('emissao-gta', 'pessoa', 'USA DADOS DE', 82, 'Os dados cadastrais do solicitante são reutilizados na emissão.', 'O emissor deve possuir cadastro válido de pessoa física ou jurídica.'),
  relation('emissao-gta', 'estabelecimento', 'RELACIONADO A', 86, 'O estabelecimento define a procedência ou destino do trânsito.', 'Quando a procedência for um estabelecimento agropecuário, ele deve estar ativo.'),
  relation('exploracao', 'estabelecimento', 'DEPENDE DE', 95, 'Toda exploração é mantida dentro de um estabelecimento agropecuário.', 'A exploração deve estar vinculada a um estabelecimento ativo.'),
  relation('exploracao', 'produtor', 'DEPENDE DE', 93, 'A exploração possui um produtor responsável.', 'Identificar o produtor responsável pela exploração.'),
  relation('exploracao', 'nucleo', 'RELACIONADO A', 77, 'Explorações podem ser agrupadas por núcleo de produção.', 'Associar a exploração a um núcleo quando aplicável.'),
  relation('exploracao', 'especie', 'USA DADOS DE', 78, 'O saldo da exploração é controlado por espécie.', 'Controlar o saldo de animais separadamente para cada espécie.'),
  relation('vacinacao', 'especie', 'DEPENDE DE', 88, 'Campanhas e exigências de vacinação são definidas por espécie.', 'Consultar campanhas vigentes para a espécie declarada.'),
  relation('vacinacao', 'doenca', 'DEPENDE DE', 93, 'Cada campanha de vacinação é criada para uma doença controlada.', 'A declaração deve indicar a doença e a campanha sanitária.'),
  relation('recebimento', 'emissao-gta', 'USA DADOS DE', 97, 'O recebimento usa os dados gerados na GTA emitida.', 'Localizar a GTA pelo número e recuperar origem, destino e animais.'),
  relation('cancelamento', 'emissao-gta', 'DEPENDE DE', 98, 'Apenas uma GTA previamente emitida pode ser cancelada.', 'Validar a situação atual da GTA antes de permitir o cancelamento.'),
  relation('evento', 'finalidade', 'USA REGRA DE', 84, 'O trânsito para eventos exige finalidade compatível.', 'A finalidade de trânsito deve indicar participação em evento pecuário.'),
  relation('evento', 'emissao-gta', 'RELACIONADO A', 80, 'Entradas e saídas de eventos são documentadas por GTA.', 'Vincular as GTAs de entrada e saída ao evento.'),
  relation('abatedouro', 'recebimento', 'RELACIONADO A', 81, 'O recebimento confirma a chegada dos animais ao abatedouro.', 'Registrar o estabelecimento de destino no recebimento.'),
  relation('abatedouro', 'especie', 'USA REGRA DE', 76, 'O abatedouro só pode receber espécies autorizadas.', 'Validar se a espécie consta no registro sanitário do abatedouro.'),
  relation('estabelecimento', 'pessoa', 'USA DADOS DE', 90, 'O estabelecimento exige um responsável cadastrado.', 'Vincular ao menos uma pessoa responsável pelo estabelecimento.'),
  relation('produtor', 'pessoa', 'DEPENDE DE', 96, 'O cadastro de produtor complementa uma pessoa física ou jurídica.', 'Selecionar uma pessoa válida para criar o perfil de produtor.'),
  relation('nucleo', 'estabelecimento', 'DEPENDE DE', 89, 'O núcleo pertence a um estabelecimento.', 'Criar o núcleo dentro de um estabelecimento agropecuário.'),
  relation('nucleo', 'produtor', 'RELACIONADO A', 73, 'O núcleo pode indicar um produtor responsável.', 'Definir o responsável operacional pelo núcleo.'),
  relation('finalidade', 'especie', 'USA REGRA DE', 90, 'As finalidades permitidas variam conforme a espécie.', 'Relacionar cada finalidade às espécies para as quais é válida.'),
  relation('taxa', 'finalidade', 'DEPENDE DE', 86, 'O valor da taxa pode variar pela finalidade de trânsito.', 'Aplicar a tabela vigente de acordo com a finalidade selecionada.'),
  relation('taxa', 'emissao-gta', 'FORNECE DADOS PARA', 88, 'O cálculo fornece o valor utilizado no fechamento da emissão.', 'Apresentar o valor da taxa na etapa de confirmação da GTA.'),
  relation('doenca', 'especie', 'RELACIONADO A', 85, 'Doenças possuem uma ou mais espécies suscetíveis.', 'Definir as espécies suscetíveis e as medidas aplicáveis.'),
  relation('vacinacao', 'exploracao', 'FORNECE DADOS PARA', 79, 'A vacinação atualiza a situação sanitária da exploração.', 'A cobertura declarada deve ser associada à exploração pecuária.'),
  relation('recebimento', 'estabelecimento', 'USA DADOS DE', 83, 'O destino do recebimento deve ser um estabelecimento válido.', 'Confirmar o estabelecimento que efetivamente recebeu os animais.'),
  relation('cancelamento', 'taxa', 'USA REGRA DE', 75, 'O cancelamento avalia se a taxa pode ser estornada.', 'Estornar a taxa somente quando permitido pela situação do pagamento.'),
  relation('recebimento', 'abatedouro', 'USA DADOS DE', 72, 'Quando o destino é abate, dados do frigorífico são registrados.', 'Identificar o abatedouro frigorífico responsável pelo recebimento.'),
];

const anchorRequirements = ['emissao-gta', 'especie', 'produtor', 'estabelecimento', 'exploracao', 'vacinacao', 'finalidade', 'evento', 'recebimento', 'taxa'];
const generatedRequirements = requirements.filter((item) => item.id.startsWith('mock-'));
const generatedRelations: Relation[] = generatedRequirements.flatMap((item, index) => {
  const anchor = anchorRequirements[index % anchorRequirements.length];
  const previous = index === 0 ? 'emissao-gta' : generatedRequirements[index - 1].id;
  return [
    relation(item.id, anchor, index % 2 === 0 ? 'DEPENDE DE' : 'USA DADOS DE', 68 + (index % 27), `${item.title} utiliza definições mantidas em outro requisito do domínio.`, `Os dados necessários devem ser obtidos a partir de ${item.title.toLocaleLowerCase('pt-BR')} e validados antes da confirmação.`),
    relation(item.id, previous, index % 3 === 0 ? 'USA REGRA DE' : 'RELACIONADO A', 64 + (index % 24), `${item.title} compartilha regras e informações com uma história próxima do mesmo fluxo.`, `Considerar os registros relacionados durante o processamento de ${item.title.toLocaleLowerCase('pt-BR')}.`),
  ];
});

export const relations: Relation[] = [...coreRelations, ...generatedRelations];

export const relationCount = (requirementId: string) => relations.filter((item) => item.source === requirementId || item.target === requirementId).length;
