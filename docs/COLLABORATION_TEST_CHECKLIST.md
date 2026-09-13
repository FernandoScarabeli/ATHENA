# Checklist de validação — editor colaborativo

Use esta lista antes de considerar o passe colaborativo entregue. Execute contra PostgreSQL real; mocks são aceitos apenas em testes unitários de fronteira.

## Critérios do contrato — validação pendente

- [ ] Banco PostgreSQL novo, Prisma, build e testes iniciam sem depender de dados legados; nenhuma migração automática do RequisitoGraph é esperada nesta baseline.
- [ ] Workspaces novos atribuem `OWNER` ao criador e o contrato compartilhado representa exatamente `OWNER`, `EDITOR` e `VIEWER`, além de critérios estruturados, templates, referências, threads, mensagens e notificações.
- [ ] JSON TipTap aceita tabelas e o template de User Story; HTML bruto, atributos desconhecidos, URLs inseguras e documento acima de 256 KB são rejeitados.

## Autorização e isolamento

- [ ] Owner cria/lista/altera/remove membro cadastrado e não consegue eliminar ou rebaixar o último Owner.
- [ ] Editor cria, altera, arquiva requisito, administra templates e referências existentes, mas não administra membros ou projetos.
- [ ] `VIEWER` lê e cria/responde comentários, mas não edita requisitos, relações, referências, templates, pastas ou membros; as rotas mutáveis indevidas retornam erro de autorização.
- [ ] Nenhum usuário acessa requisito, template, comentário, referência, membro ou notificação de outro workspace.

## Documento, versão e template

- [ ] Criar requisito em branco e por template gera código do projeto, cópia independente do documento e critérios ordenados.
- [ ] Alterar título, conteúdo, User Story ou critério cria um único snapshot, ActivityLog e incremento de revisão na mesma transação.
- [ ] Duas sessões salvando a mesma revisão: a segunda recebe `REQUIREMENT_REVISION_CONFLICT` com `details.currentRevision`; o rascunho local continua disponível.
- [ ] Recarregar depois de salvar preserva tabelas, formatação, critérios, referências e a revisão atual.
- [ ] Arquivamento não apaga versões, comentários ou ActivityLog; remove relações e mantém a US recuperável em Canceladas, em modo somente leitura (comportamento desejado ainda pendente de validação).

## Comentários e notificações

- [ ] Selecionar texto cria uma thread ancorada; resposta, resolução e reabertura preservam a conversa.
- [ ] Apagar ou editar o texto selecionado não remove a thread: o editor mostra o fallback da âncora.
- [ ] Autor, Editor e Owner podem resolver/reabrir; um `VIEWER` só pode resolver/reabrir thread que criou.
- [ ] Mencionar membro válido do mesmo workspace gera notificação interna para ele; usuários externos não são mencionáveis.
- [ ] Apenas o destinatário lista ou marca sua notificação como lida.
- [ ] Operações de comentário e notificação não incrementam `Requirement.revision`.

## Interface e operação

- [ ] Toolbar de escrita e tabela aparece por contexto e é navegável por teclado; Ctrl/Cmd+S salva.
- [ ] Saída, troca de requisito ou recarga com alterações não salvas pedem confirmação.
- [ ] A interface oculta/desabilita ações sem papel suficiente, mas os testes confirmam a proteção real pelo backend.
- [x] Fluxo E2E HTTP: registro → workspace → projeto → template → critério → salvar → comentário/menção → recarregar → persistência. Executado em 12/09/2026 contra PostgreSQL temporário `athena_test` (2 cenários em `api.e2e.spec.ts`); inclui cookie, autorização, isolamento, versões, relações, referências e arquivamento.
- [ ] Verificar desktop e mobile, foco, contraste, console sem erros, lint, build, testes relevantes e stack Docker.

## Fases futuras deste programa

Os itens abaixo pertencem a fases posteriores deste programa. Não são critérios aprovados nesta rodada e devem receber tarefas e evidências próprias:

- Provider real de IA integrado ao fluxo da API e validação de contas externas GitHub/Google.

## Fora do MVP desta rodada

Os itens abaixo permanecem deliberadamente fora do MVP e não são pré-requisitos para declarar o contrato atual concluído:

- Migração/conversão automática de memberships, tipos, códigos, tags ou dados do RequisitoGraph.
- Edição simultânea, convites por e-mail, uploads binários, notificações externas, permissões por projeto, templates globais e analytics avançado.

Quando um item acima for iniciado, ele deve receber uma tarefa própria, critérios de aceite próprios e evidências separadas.
