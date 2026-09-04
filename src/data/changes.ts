export const simulatedChange = {
  requirementId: 'especie',
  before: 'Espécies do grupo Bovídeos possuem controle de rebanho.',
  after: 'Espécies dos grupos Bovídeos e Equídeos possuem controle de rebanho.',
  impacts: [
    { requirementId: 'emissao-gta', level: 'alto', confidence: 94, reason: 'A regra alterada em Espécie é utilizada por esta história.' },
    { requirementId: 'exploracao', level: 'médio', confidence: 78, reason: 'O saldo da exploração é segmentado por grupos de espécie.' },
    { requirementId: 'vacinacao', level: 'médio', confidence: 71, reason: 'Campanhas e exigências sanitárias são configuradas por grupo de espécie.' },
  ],
};
