# Camada de IA

Esta pasta concentra os componentes operacionais de IA que não pertencem à API HTTP: imagens de modelos, prompts versionados, jobs e avaliação. A API usa o contrato `AiProvider`; nenhum modelo ou documento de cliente é armazenado aqui.

Para o ambiente local, inicie `docker compose --profile ai up ollama` e configure `AI_PROVIDER=ollama`.
