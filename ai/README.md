# Camada de IA

Esta pasta concentra os componentes operacionais de IA que não pertencem à API HTTP: imagens de modelos, prompts versionados, jobs e avaliação. A API usa o contrato `AiProvider`; nenhum modelo ou documento de cliente é armazenado aqui.

Para o ambiente local, configure no `.env` `AI_PROVIDER=ollama`, suba toda a stack com `docker compose up --build -d` e instale os modelos configurados no container:

```sh
docker compose exec ollama ollama pull llama3.2
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama list
```

Em Docker, `OLLAMA_BASE_URL` deve ser `http://ollama:11434`. A API usa o modelo de geração no job de sugestões; o modelo de embedding é instalado e configurado para manter o ambiente pronto para os fluxos que vierem a utilizá-lo.
