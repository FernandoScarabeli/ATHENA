# ATH-012 — auditoria visual parcial

Data: 12/09/2026. Evidência capturada em navegador Chrome conectado, na rota autenticada do projeto ATHENA.

## Passos observados

1. **Visão geral de Pastas — saudável.** Desktop apresenta hierarquia, ações e empty state com clareza: título, ação `Nova pasta`, ação `Novo requisito` e orientação para o próximo passo.
2. **Mapa — saudável no estado vazio.** A troca Visão geral → Mapa é clara, a aba ativa fica evidente e o empty state orienta a criar o primeiro requisito.
3. **Importações — saudável no estado vazio.** A navegação chega ao painel de candidatos, que comunica que importações exigem sincronização e não sugere alteração automática de US.
4. **Mobile 390×844 — corrigido.** A navegação horizontal antes excedia a largura e mostrava uma barra de rolagem. O CSS mobile agora usa itens comprimidos com largura mínima zero, tipografia/contadores menores e overflow oculto; os cinco destinos aparecem sem overflow.
5. **Mapa com dados reais — saudável.** Com duas US ativas criadas no workspace conectado (`US-001 teste1` e `US-002 aaa`) e uma relação `RELATED_TO`, o grafo apresenta nós, seta, legenda e drawer de detalhes de modo compreensível. O drawer mostra origem/destino, tipo, pasta e fonte sem confundir a relação com uma alteração pendente.
6. **Editor e histórico — saudáveis.** A US `teste1` apresentou o documento rico, tabela e seções com boa legibilidade em desktop. O painel de histórico mostrou Revisão 1 e Revisão 2 (atual), datas, seletores De/Para e o resumo de alteração (`documento`, `status`), sem criar snapshot fictício para a revisão atual.
7. **Comentários — saudável.** O drawer exibiu um comentário existente, citação, estado aberto, ação `Fechar` e campo de resposta. Em 390×844, o drawer ocupa a largura disponível e continua legível; nenhuma escrita foi feita durante a auditoria.
8. **Teclado e console — parcial.** Tab alcançou botões `Abrir avisos` e `Abrir membros` em sequência. Não houve erros. Foram encontrados seis warnings repetidos do TipTap/linkifyjs sobre schemes `http`, `https` e `mailto` já inicializados; a causa foi corrigida ao parar de registrar os protocolos padrão em cada editor. Após recarregar, o buffer mostrou somente as entradas históricas, sem novas ocorrências. Isso confirma navegabilidade básica, não conformidade WCAG completa.

## Correção aplicada

`frontend/src/styles.css` ajusta `.workspace-tabs` no breakpoint até 760px: remove o overflow horizontal visível, permite redução dos itens e preserva indicador ativo/contadores. A suíte frontend passou em 41/41 e `tsc -b` passou após a mudança.

`RequirementEditor` e `TemplateEditor` agora usam a configuração padrão do `Link` para `http`, `https` e `mailto`, que a dependência já aceita. Isso elimina a dupla inicialização global que produzia warnings ao montar mais de um editor. A suíte frontend continuou em 41/41, `tsc -b` e `git diff --check` passaram.

## Limites e próxima evidência necessária

O projeto conectado agora continha duas US, uma relação, duas revisões e um comentário, o que permitiu validar os fluxos acima sem alterar dados. Para não poluir dados do usuário, esta auditoria não criou fixtures pela interface. Ainda faltam capturas em ambiente isolado com dados para:

- formulário de criação/validação de US, critérios e templates;
- ações mutáveis do drawer de relações, sugestões de IA e comentários (com confirmação, RBAC e retry);
- Canceladas, candidatos de integração e estados de falha/retry;
- foco visível em todos os controles, contraste medido e navegação de teclado fim a fim;
- boot limpo e backup/restore controlados.

Não afirmar conformidade de acessibilidade completa até essas evidências existirem.
