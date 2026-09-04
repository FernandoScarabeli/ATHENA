# US-1042 — Emissão de GTA

## Descrição

Eu, como usuário do sistema, quero gerenciar a emissão de Guias de Trânsito Animal para permitir o trânsito adequado dos animais.

## Critérios de aceitação

1. O usuário deve selecionar uma espécie.
2. As finalidades disponíveis devem ser filtradas de acordo com a espécie.
3. Deve ser informado o produtor responsável.
4. Quando a procedência for um estabelecimento agropecuário, deve ser selecionada uma exploração pecuária.
5. Para determinadas espécies, devem ser consideradas informações de vacinação.
6. A quantidade de animais deve respeitar o saldo disponível na exploração.
7. O sistema deve calcular e apresentar a taxa antes da confirmação.

## Regras de negócio

- A exploração de origem precisa estar ativa e vinculada ao produtor informado.
- Pendências sanitárias impeditivas devem bloquear a emissão.
- A GTA confirmada deve receber um número único.
