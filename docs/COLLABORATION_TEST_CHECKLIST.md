# Checklist de validação — editor colaborativo

Use esta lista antes de considerar o passe colaborativo entregue. Execute contra PostgreSQL real; mocks são aceitos apenas em testes unitários de fronteira.

## Banco e contratos

- [ ] A migration transforma memberships legadas `MEMBER` em `EDITOR`, preservando acesso; workspaces novos atribuem `OWNER` ao criador.
- [ ] Prisma, build e testes começam com banco vazio e com base existente contendo requisito, critérios, versões e memberships legadas.
- [ ] O contrato compartilhado representa todos os quatro papéis, critérios estruturados, templates, referências, threads, mensagens e notificações.
- [ ] JSON TipTap aceita tabelas e o template de User Story; HTML bruto, atributos desconhecidos, URLs inseguras e documento acima de 256 KB são rejeitados.

## Autorização e isolamento

- [ ] Owner cria/lista/altera/remove membro cadastrado e não consegue eliminar ou rebaixar o último Owner.
- [ ] Editor cria, altera, arquiva requisito, administra templates e referências, mas não administra membros ou projetos.
- [ ] Commenter só lê requisito e cria/responde comentário; PATCH, criação de relação, referência e template retornam erro de autorização.
- [ ] Viewer somente lê; qualquer rota mutável, inclusive comentário, retorna erro de autorização.
- [ ] Nenhum usuário acessa requisito, template, comentário, referência, membro ou notificação de outro workspace.

## Documento, versão e template

- [ ] Criar requisito em branco e por template gera código do projeto, cópia independente do documento e critérios ordenados.
- [ ] Alterar título, conteúdo, User Story ou critério cria um único snapshot, ActivityLog e incremento de revisão na mesma transação.
- [ ] Duas sessões salvando a mesma revisão: a segunda recebe `REQUIREMENT_REVISION_CONFLICT` com `details.currentRevision`; o rascunho local continua disponível.
- [ ] Recarregar depois de salvar preserva tabelas, formatação, critérios, referências e a revisão atual.
- [ ] Arquivamento não apaga versões, comentários, relações ou ActivityLog.

## Comentários e notificações

- [ ] Selecionar texto cria uma thread ancorada; resposta, resolução e reabertura preservam a conversa.
- [ ] Apagar ou editar o texto selecionado não remove a thread: o editor mostra o fallback da âncora.
- [ ] Autor, Editor e Owner podem resolver/reabrir; outro Commenter não pode resolver thread alheia.
- [ ] Mencionar membro válido do mesmo workspace gera notificação interna para ele; usuários externos não são mencionáveis.
- [ ] Apenas o destinatário lista ou marca sua notificação como lida.
- [ ] Operações de comentário e notificação não incrementam `Requirement.revision`.

## Interface e operação

- [ ] Toolbar de escrita e tabela aparece por contexto e é navegável por teclado; Ctrl/Cmd+S salva.
- [ ] Saída, troca de requisito ou recarga com alterações não salvas pedem confirmação.
- [ ] A interface oculta/desabilita ações sem papel suficiente, mas os testes confirmam a proteção real pelo backend.
- [ ] Fluxo E2E: registro → workspace → projeto → template ou documento em branco → tabela/critério → salvar → comentário/menção → recarregar → persistência.
- [ ] Verificar desktop e mobile, foco, contraste, console sem erros, lint, build, testes relevantes e stack Docker.
