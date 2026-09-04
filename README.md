# RequisitoGraph — MVP

MVP web para demonstrar rastreabilidade inteligente entre requisitos. A experiência simula a conexão de uma pasta do Google Drive, a análise de histórias de usuário, a criação automática de um grafo de relações e a identificação de possíveis impactos quando um requisito muda.

## Como executar

```bash
npm install
npm run dev
```

Para gerar a versão de produção:

```bash
npm run build
```

## O que está simulado

- conexão, leitura e sincronização com o Google Drive;
- análise por LLM;
- identificação de relações, evidências e níveis de confiança;
- detecção de alterações e sugestões de impacto;
- links para os documentos de origem e decisões sobre impactos.

Não há backend, banco de dados, autenticação, OAuth ou chamadas externas. Todos os dados usados pela interface estão em `src/data`. A pasta `data` contém exemplos de documentos que representam a fonte fictícia da demonstração.

## Evolução futura

Uma versão real poderia usar OAuth e Google Drive API para ler documentos autorizados, processar versões e alterações, gerar embeddings para recuperação de contexto e usar uma LLM com RAG para propor relações e evidências rastreáveis. As sugestões continuariam sujeitas à revisão humana antes de atualizar o mapa oficial.
