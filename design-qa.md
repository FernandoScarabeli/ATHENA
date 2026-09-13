# Design QA — tela de autenticação ATHENA

## Escopo e evidências

- Source visual truth path: `/tmp/codex-clipboard-3Y5baB.png`.
- Source pixel dimensions: `1855 × 923`.
- Implementation path: `frontend/`.
- Implementation screenshot path: indisponível; o navegador integrado retornou `No browser is available`.
- Viewport-alvo: desktop, aproximadamente `1855 × 923`, estado de login não autenticado.
- Estado implementado: login com alternância para cadastro, campos com ícones, lembrar de mim e recuperação informativa.
- Density normalization: não aplicada; não existe captura renderizada atual para formar um par comparável.

## Findings

- [P2 — bloqueado] Não foi possível validar fidelidade visual no navegador.
  - Local: tela de autenticação em `frontend/src/features/auth/AuthPage.tsx` e `frontend/src/components/ui/sign-in-form.tsx`.
  - Evidência: a fonte visual foi aberta, mas a captura do frontend não pôde ser obtida porque não há navegador disponível nesta sessão.
  - Impacto: wrapping real, proporções, contraste efetivo, foco, responsividade e erros de console não foram observados.
  - Ação necessária: capturar a implementação no mesmo viewport e comparar com `/tmp/codex-clipboard-3Y5baB.png`.

## Required fidelity surfaces

- Fonts and typography: preservada a pilha global existente (`Inter, ui-sans-serif, system-ui...`), com hierarquia compacta e título de alto contraste. Renderização efetiva não foi confirmada.
- Spacing and layout rhythm: o cabeçalho mantém 68 px; o layout continua em duas colunas; o cartão usa raio, borda e sombra coerentes com a referência. A validação visual final está bloqueada.
- Colors and visual tokens: fundo claro, cartão branco, bordas frias e ação escura seguem a referência e os tokens existentes.
- Image quality and asset fidelity: não há imagens no novo componente; os ícones usam `lucide-react`, já presente no projeto.
- Copy and content: removidos `Requirements hub` e `Rastreabilidade de ponta a ponta`, conforme solicitado. O formulário está em português e mantém o fluxo real de login/cadastro.
- Responsiveness: foram preservados os breakpoints existentes de 900 px e 680 px; não foi possível testar captura mobile/tablet.
- Accessibility and interactions: labels, autocomplete, foco visível, checkbox controlado, troca login/cadastro, estado de erro e botão de recuperação estão implementados; não foram exercitados no navegador.

## Full-view comparison evidence

Bloqueada. A imagem de referência foi aberta, mas não há screenshot renderizado da implementação para comparação conjunta.

## Focused region comparison evidence

Bloqueada. As regiões prioritárias seriam: cabeçalho/marca, composição das duas colunas, cartão de login, campos com ícones e comportamento em 680 px.

## Primary interactions and console

- Build: `corepack pnpm --filter @athena/web build` passou.
- TypeScript/lint: incluído no build e passou.
- Testes: `corepack pnpm --filter @athena/web test` passou com 20 testes.
- Browser interaction: não executada; navegador integrado indisponível.
- Console errors checked: não foi possível verificar.

## Comparison history

### Iteração 1 — integração do formulário

- Mudanças: removidos o badge superior e o eyebrow; criado `frontend/src/components/ui/sign-in-form.tsx`; integrado ao fluxo existente de login/cadastro; adicionados ícones, checkbox, recuperação informativa e CTA com seta.
- Evidência técnica pós-correção: build e 20 testes passaram.
- Evidência visual pós-correção: bloqueada pela ausência de navegador.

## Open questions

- Os botões sociais do exemplo não foram adicionados porque o backend atual não oferece autenticação social; assim, o novo componente não apresenta ações visuais sem integração.

## Implementation checklist

1. Abrir a aplicação no navegador integrado quando disponível.
2. Capturar a tela em `1855 × 923` e comparar com a fonte.
3. Testar cadastro, erro de login, checkbox, recuperação e breakpoint de 680 px.
4. Corrigir qualquer P0/P1/P2 visual encontrado.

final result: blocked

Blocker: não há navegador disponível nem screenshot renderizado atual para a comparação visual obrigatória.

---

# Design QA — compositor de relações

- Source visual truth: `/home/fernandoscarabeli/.codex/generated_images/01a097cf-03fd-7c12-ac52-157924ff948e/exec-fbd34fe6-fcde-484b-a1ee-52d3664eea7d.png` (420 × 720).
- Implementation: `RequirementDrawer.tsx` e `styles.css`; viewport-alvo: drawer de 420 px.
- Captura renderizada: bloqueada. A prévia local abriu no Chrome, mas chegou à tela de login e não havia sessão/fixture autorizada para abrir um drawer com dados; nenhuma escrita foi feita.

**Findings**

- [P2] Comparação visual do estado real ainda não executada. O compositor, escolha de US, inversão, tipos e prévia têm testes de UI, mas precisam de captura autenticada desktop/mobile.

**Required fidelity surfaces**

- Tipografia, ritmo, cores e copy usam os tokens existentes e foram alinhados ao mock selecionado; imagem/arte customizada não é usada e os ícones vêm de `lucide-react`.
- Responsividade e foco ainda exigem inspeção renderizada; a interface usa botões rotulados, `radiogroup`, `listbox` e foco global visível.

**Implementation checklist**

1. Abrir uma US com ao menos outra US ativa em ambiente isolado.
2. Capturar o drawer em 420 px e mobile, abrir seletor, inverter direção e criar relação.
3. Comparar com a fonte acima e corrigir quaisquer P0/P1/P2.

final result: blocked

Blocker: falta sessão autenticada com fixture segura para captura visual comparável.
