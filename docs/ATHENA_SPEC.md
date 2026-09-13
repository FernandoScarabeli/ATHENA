# ATHENA — especificação de produto e execução

## Objetivo

ATHENA organiza User Stories em workspaces e projetos, permite escrever documentos ricos, revisar alterações, comentar e navegar pelas relações entre histórias. A visão inicial é Pastas; uma US abre o grafo de suas relações. O servidor é a fonte de verdade para autorização, status, versões, códigos e vínculos.

Este documento consolida o contrato da rodada de execução. [BACKLOG.md](BACKLOG.md) define a ordem; cada item possui uma spec em `docs/tasks/`. `PRODUCT_DECISIONS.md`, `DOMAIN_MODEL.md` e `REST_API.md` devem acompanhar qualquer mudança de comportamento.

## Regras do produto

- Todo requisito é uma User Story (`USER_STORY`) com código `US-###` único por projeto. Código e projeto são imutáveis.
- Toda US pertence a exatamente uma pasta do workspace. `Sem pasta` existe sempre e não pode ser excluída. Excluir outra pasta realoca suas US para `Sem pasta`.
- A US nasce `DRAFT`, torna-se `ACTIVE` no primeiro salvamento editorial e passa a `ARCHIVED` ao cancelar. Canceladas ficam consultáveis em modo leitura, fora da visão ativa e sem relações.
- O documento é JSON TipTap validado no backend, com limite de 256 KB. A gravação é explícita. Revisão otimista impede sobrescrever outra edição; conflitos preservam o rascunho local.
- Critérios de aceite são entidades ordenadas com título, Dado/Quando/Então e texto. Tabelas e formatação pertencem ao documento.
- Relações conectam somente US do mesmo projeto. IA nunca as grava sem aprovação humana. Sugestões são persistidas separadamente com estado `PENDING`, `CONFIRMED` ou `DISMISSED`; relação exige alvo ativo do mesmo projeto e referência exige URL `http`, `https` ou `mailto`.
- Templates pertencem ao workspace. Aplicá-los cria cópia independente do documento e dos critérios.
- Comentários podem ter âncora de seleção, respostas, resolução e menções. Alterações em comentários não incrementam a revisão editorial.
- Referências existentes são consultáveis/removíveis. O fluxo de criação para usuários será a aprovação de sugestão da IA; nenhum formulário de criação manual será oferecido.

## Papéis e acesso

Há três papéis. `OWNER` administra membros, workspace e projetos, além de editar e comentar. `EDITOR` edita US, pastas, templates, relações e comentários, sem administrar membros ou projetos. `VIEWER` lê e comenta, mas não edita. Esta é a decisão da rodada: a nomenclatura `COMMENTER` dos documentos antigos é obsoleta. Todas as rotas verificam membership no backend; controles da UI são apenas complemento.

O último Owner não pode ser removido nem rebaixado. Usuários de outro workspace não podem ler ou alterar suas US, pastas, templates, comentários, relações, referências, membros ou notificações.

## Fluxos prioritários

1. Registro/login → selecionar ou criar workspace/projeto → Pastas.
2. Criar US em pasta, em branco ou por template → editar documento e critérios → salvar explicitamente → ativar US.
3. Selecionar US → grafo focado → consultar detalhes e criar/remover relações conforme papel.
4. Comentar trecho, responder, mencionar, resolver/reabrir → receber notificação interna.
5. Consultar versões e comparar diferenças; cancelar US e encontrá-la em Canceladas, somente leitura.
6. Após ativação, executar análise de IA assíncrona → apresentar sugestões justificadas → aprovar ou descartar uma a uma.
7. Conectar GitHub/Google com credenciais autorizadas → importar candidatos revisáveis → sincronizar sem alterar automaticamente a US canônica.

## Contratos e limites

- API REST em `/api`, erros `{ error: { code, message, details? } }`, sessão via cookies HttpOnly. A documentação de rotas detalhada fica em `REST_API.md`.
- O banco suportado para esta baseline é PostgreSQL novo com extensão pgvector. Não haverá migração automática de RequisitoGraph nem importação de seus mocks/dados. Uma base antiga exige projeto de migração separado.
- Edição simultânea, convites por e-mail, upload binário, notificações externas, permissões por projeto, templates globais e analytics avançado ficam no backlog futuro; não integram a conclusão desta rodada.
- Integrações GitHub/Google serão implementadas e cobertas por testes isolados. Validação real com contas de teste dependerá de credenciais disponibilizadas posteriormente e será registrada separadamente.

## Qualidade e aceite global

Uma tarefa só é concluída quando seu comportamento passa nos testes pertinentes, `corepack pnpm build` e `corepack pnpm lint` quando aplicáveis, e os documentos afetados estão atualizados. Mudanças em autorização, transações e persistência exigem testes com PostgreSQL real; mocks são aceitos em testes unitários de fronteira. O fluxo principal exige E2E, revisão de teclado/foco e desktop/mobile. O coordenador registra evidências e limitações em `EXECUTION_LOG.md`.

## Coordenação

O coordenador executa uma tarefa por vez com agente `gpt-5.6-luna` em esforço médio. Para cada tarefa: confirmar pré-requisitos e alterações locais; enviar a spec; revisar diff e testes; pedir correção ao mesmo agente se necessário; atualizar quadro/log; seguir para a próxima. Não executar `sudo`, reset destrutivo, exclusão de dados nem exposição de credenciais. Alterações já presentes na árvore de trabalho pertencem ao usuário e serão preservadas.

Antes de interromper por contexto ou bloqueio, atualizar `BACKLOG.md`, `EXECUTION_LOG.md` e `CONTINUITY.md` com tarefa ativa, arquivos tocados, testes, riscos e próxima ação. Um sucessor `gpt-5.6-terra` em esforço médio pode assumir a partir dessa documentação se houver mecanismo de continuação disponível; abrir um novo chat não é uma capacidade garantida desta interface.
