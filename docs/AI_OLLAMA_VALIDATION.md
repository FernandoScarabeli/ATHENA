# Validação local do Ollama

## Pré-requisitos

- Docker disponível para o operador; o serviço Ollama integra a stack padrão.
- `.env` local com `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://ollama:11434`, `OLLAMA_GENERATION_MODEL=llama3.2`, `OLLAMA_EMBEDDING_MODEL=nomic-embed-text` e `AI_TIMEOUT_MS=15000`.
- Os modelos configurados aparecem em `docker compose exec ollama ollama list`.

## Roteiro de evidência

1. Suba a stack com `docker compose up --build -d` e confirme `api`, `postgres` e `ollama` saudáveis.
2. Em um projeto descartável, mantenha uma US ativa de contexto e crie uma segunda US em rascunho descrevendo uma dependência inequívoca da primeira.
3. Salve a segunda US para ativá-la. Acompanhe `GET /api/requirements/:id/ai-analysis` até o estado `COMPLETED` e consulte `GET /api/requirements/:id/ai-suggestions`.
4. Registre os IDs mascarados, a imagem/modelos usados, horários e o estado da análise. A evidência só é aprovada quando existir pelo menos uma sugestão `PENDING`.
5. Confirme que não houve criação de relação ou referência antes da decisão humana. Quando houver uma sugestão de referência, valide que o link também permanece pendente até aprovação explícita de `OWNER` ou `EDITOR`.

Uma resposta válida sem sugestões termina em `COMPLETED`; o retry é reservado a uma análise `FAILED`. Nesse caso, crie outra US descartável com contexto mais explícito em vez de alterar dados ou reexecutar uma análise concluída.

## Registro desta execução

| Campo | Valor |
| --- | --- |
| Data/hora | 2026-09-13 (America/Sao_Paulo) |
| Imagem Ollama | `ollama/ollama:latest`, Ollama 0.34.0 |
| Modelos instalados | `llama3.2:latest` (2,0 GB) e `nomic-embed-text:latest` (274 MB) |
| Análise | US `6921f6dd…`: `COMPLETED` |
| Sugestões pendentes | 2: uma `RELATION` e uma `REFERENCE`, ambas `PENDING` |
| Aprovação humana preservada | 0 relações e 0 referências criadas automaticamente |

O host local executou `llama3.2` em CPU. O timeout de 15 s e, depois, de 60 s foi insuficiente para respostas estruturadas neste ambiente; a evidência aprovada usou `AI_TIMEOUT_MS=120000` somente no `.env` local. Respostas com alvo de relação inválido foram rejeitadas pelo backend sem criar vínculos. A lista explícita de alvos permitidos foi adicionada ao prompt antes da execução final.

Não registre segredos, cookies, conteúdo sensível de US nem URLs privadas neste documento.
