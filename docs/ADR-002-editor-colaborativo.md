# ADR-002: Documento rico, colaboração e permissões de workspace

## Contexto

As User Stories usadas pela equipe combinam narrativa, cenários de aceite, tabelas de especificação, links e revisão por comentários. Texto plano ou um único campo JSON não torna critérios, referências e colaboração consultáveis. Também é necessário permitir que pessoas diferentes visualizem, comentem ou editem o mesmo workspace sem conceder acesso administrativo.

## Decisão

- O conteúdo editorial é armazenado como JSON TipTap, nunca HTML. O servidor aceita apenas nós, marcas e atributos explicitamente permitidos, limita o documento a 256 KB e restringe links a `http`, `https` e `mailto`. A formatação de documento usa fonte segura, tamanho preset, cor/destaque hexadecimal e alinhamento validado; CSS arbitrário nunca é persistido.
- Tabelas fazem parte do documento TipTap para preservar a aparência de especificações como `Campo / Tipo / Descrição / Exemplo`. Critérios, referências e relações continuam normalizados no banco porque precisam de ordenação, consulta, histórico e rastreabilidade.
- Há templates nativos e `DocumentTemplate` privados do workspace. Owner e Editor podem administrar templates; aplicar um template cria uma cópia independente.
- A colaboração inicial usa edição exclusiva por revisão otimista, não CRDT/edição simultânea. Conflitos devolvem `REQUIREMENT_REVISION_CONFLICT` e o cliente mantém o rascunho local para reconciliação.
- O editor usa salvamento explícito: cada clique em “Salvar agora” ou Ctrl/Cmd+S gera no máximo uma nova revisão, mantendo o controle de revisão otimista.
- Comentários são threads ancoradas em seleção, com mensagens e menções. A âncora persistida contém posições e a citação selecionada como fallback; apagar o trecho não apaga a thread.
- A autorização é centralizada no backend usando `WorkspaceMember.role`: Owner administra workspace e projetos; Editor edita; Viewer lê e comenta, mas não edita. `COMMENTER` é nomenclatura obsoleta e não é um papel atual. O frontend apenas adapta a interface ao papel, sem substituir a verificação do servidor.

## Consequências

- O editor pode ser visualmente simples, mantendo comandos de tabela e formatação contextuais em vez de uma barra fixa extensa. A User Story é escrita diretamente no Documento; não há campos separados de descrição.
- Comentários e templates não incrementam a revisão do requisito; mudanças no conteúdo/metadados/critério, sim.
- O primeiro MVP não oferece upload, convites por e-mail, notificações externas, permissões por projeto ou edição simultânea. O provider real de IA ainda não está integrado ao fluxo da API.
