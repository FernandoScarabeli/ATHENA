# Design QA — ATHENA versus RequisitoGraph legado

## Escopo e evidências

- Source visual truth path: `RequisitoGraph/`, em especial `RequisitoGraph/src/index.css`, `RequisitoGraph/src/App.tsx` e `RequisitoGraph/src/components/RequirementNode.tsx`.
- Capturas históricas citadas pelo legado: `/tmp/codex-clipboard-4TC5pe.png` (1638 × 206 px) e `/tmp/codex-clipboard-Vf5ffk.png` (1031 × 477 px). Esses arquivos já não existem nesta sessão e não puderam ser abertos.
- Implementation path: `frontend/`.
- Implementation screenshot path: indisponível; o runtime do navegador integrado retornou `No browser is available` e a lista de navegadores disponíveis retornou vazia.
- Viewport-alvo para a comparação de desktop: 1440 × 900 CSS px, `deviceScaleFactor: 1`.
- Viewports responsivos planejados: 900 px e 680 px de largura, conforme os breakpoints do frontend.
- Source pixel dimensions: indisponíveis para uma captura atual; as duas dimensões históricas acima não representam uma tela completa normalizada.
- Implementation pixel dimensions: indisponíveis porque não foi possível capturar a página renderizada.
- Density normalization: não aplicada; não há um par de imagens atual e comparável.
- Estado-alvo: autenticação; onboarding; shell autenticado com mapa vazio/populado; lista; requisito selecionado com drawer; modal de criação; loading e erro.

## Findings

- [P2 — corrigido] Ícones desenhados à mão divergiam do conjunto visual original.
  - Local: `frontend/src/components/Icon.tsx`.
  - Evidência: o legado usa componentes de `lucide-react`; a primeira implementação continha paths SVG próprios.
  - Impacto: espessura, proporções e optical balance poderiam divergir do design legado, além de criar uma aproximação desnecessária de assets existentes.
  - Correção: `lucide-react@1.40.0` foi adicionado ao frontend e o adaptador `Icon` agora mapeia exclusivamente para ícones Lucide.
  - Evidência pós-correção: build e lint passaram; confirmação visual ficou pendente pela indisponibilidade do navegador.

- [P2 — corrigido] Modal não prendia nem restaurava o foco.
  - Local: `frontend/src/features/project/NewRequirementModal.tsx`.
  - Evidência: a implementação inicial movia o foco para o título e fechava com Escape, mas permitia Tab escapar do diálogo e não devolvia o foco ao controle anterior.
  - Impacto: regressão de acessibilidade por teclado e perda de contexto ao fechar o modal.
  - Correção: ciclo de Tab/Shift+Tab entre controles habilitados e restauração do foco anterior no cleanup.
  - Evidência pós-correção: TypeScript/build/lint passaram; teste interativo ficou pendente pela indisponibilidade do navegador.

- [Blocked] Não é possível afirmar fidelidade visual final sem um par de capturas renderizadas.
  - Local: todas as telas e estados.
  - Evidência: o navegador integrado não possui instância disponível; as capturas históricas referenciadas no projeto legado também não existem mais em `/tmp`.
  - Impacto: layout real, fontes resolvidas, wrapping, overflow, contraste efetivo, hover/focus, React Flow, console e responsividade não foram observados.
  - Ação necessária: capturar legado e frontend no mesmo viewport/estado e colocá-los em uma comparação conjunta antes de aprovar.

## Required fidelity surfaces

- Fonts and typography: a família declarada (`Inter, ui-sans-serif, system-ui...`), pesos, escala compacta e tracking negativo seguem a fonte do legado em código. Inter continua sem arquivo/import explícito, como no legado; a fonte efetivamente resolvida, antialiasing, wrapping e peso óptico não puderam ser verificados sem renderização.
- Spacing and layout rhythm: tokens, sidebar de 218 px, topbar de 58 px, drawer de 368 px, nós de 190 × 88 px, modal de 580 px, raios curtos, bordas finas e sombras discretas foram preservados/adaptados. O comportamento real nos viewports 1440, 900 e 680 px não foi capturado.
- Colors and visual tokens: neutros frios, ação escura, verde de sucesso, laranja de impacto e terracota de erro estão mapeados em `frontend/src/styles.css`. Contraste visual e estados ativos/disabled precisam de inspeção renderizada.
- Image quality and asset fidelity: o alvo não depende de fotografia/ilustração. A marca e os ícones agora usam Lucide, igual ao legado; não restam SVGs de ícone desenhados à mão no frontend. O preview de acesso usa apenas skeletons decorativos e não simula dados de domínio.
- Copy and content: o produto foi renomeado para ATHENA e o texto é genérico de gestão de requisitos. A busca automatizada não encontrou Defesa Agropecuária, GTA, entidades do exemplo, textos de demonstração/simulação, IDs especiais ou imports `src/data` no frontend de produção.
- Responsiveness: o `min-width: 1100px` legado não foi migrado; há breakpoints para tablet e mobile. A ausência de overlap, clipping e controles inacessíveis não pôde ser validada visualmente.
- Accessibility and interactions: foco visível, reduced motion, Escape/backdrop no modal, foco inicial, focus trap e restauração de foco existem em código. Não foram testados no navegador: navegação por teclado completa, estados hover/focus, zoom do texto, drawer, busca/filtros, seleção no grafo e modal.

## Full-view comparison evidence

Bloqueada. Não há screenshot renderizado da implementação nem captura atual do source visual no mesmo viewport e estado. A inspeção de código confirma a migração dos tokens e das dimensões estruturais, mas não substitui a comparação visual conjunta exigida.

## Focused region comparison evidence

Bloqueada. Regiões que precisam de comparação focada quando o navegador estiver disponível:

1. marca, sidebar e topbar;
2. cards de requisito, handles, edges, controles e minimap do React Flow;
3. drawer de requisito e densidade de tipografia;
4. modal de criação, foco e footer;
5. tabela/lista e breakpoints de 900/680 px.

## Primary interactions and console

- Interações previstas, mas não executadas no navegador: login/cadastro, onboarding, alternância mapa/lista, busca, filtros de tipo/status, criação de requisito, seleção de node/row, navegação por relação, reset do layout, fechamento do drawer, modal por Escape/backdrop e ciclo de foco.
- Console errors checked: não; não havia superfície de navegador disponível.
- Endpoint local: `GET /api/health` respondeu `{"status":"ok"}` após as correções.

## Comparison history

### Iteração 1

- Achados: ícones SVG próprios no lugar de Lucide; modal sem focus trap/restauração de foco; ausência de evidência renderizada.
- Correções: adoção de `lucide-react@1.40.0`; focus trap e restauração do foco anterior.
- Evidência pós-correção: `corepack pnpm --filter @athena/web build` passou e `corepack pnpm --filter @athena/web lint` passou. Não houve evidência visual pós-correção porque o navegador continuou indisponível.

## Verificações técnicas

- Build do frontend: passou.
- Lint/TypeScript do frontend: passou.
- Testes do frontend: o script existe, mas não há arquivos de teste; `vitest run` encerra com `No test files found`.
- Varredura de mocks/textos proibidos no frontend de produção: passou, sem ocorrências.
- Backend: não alterado.

## Open questions

- Nenhuma decisão de produto foi assumida. A limitação de recuperação de workspace/projeto após reload permanece fora desta revisão e depende de contrato de backend.

## Implementation checklist

1. Disponibilizar um navegador integrado/conectado.
2. Capturar o RequisitoGraph e o ATHENA em 1440 × 900, densidade 1, nos mesmos estados possíveis.
3. Comparar as imagens juntas, incluindo as cinco regiões focadas.
4. Repetir em 900 px e 680 px e testar teclado/console.
5. Corrigir qualquer P0/P1/P2 visual encontrado e repetir a captura antes de alterar o resultado final.

final result: blocked

Blocker: não há navegador disponível nem par de capturas renderizadas atual e normalizado para a comparação visual obrigatória.
