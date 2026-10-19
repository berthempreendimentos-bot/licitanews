# PEPPACORP LICITA

Plataforma para encontrar, organizar e acompanhar licitações públicas. Next.js 15 + Supabase, com dados do PNCP.

## Rodar

```bash
npm install
npm run dev
```

Abra http://localhost:3000 (ou a porta indicada no terminal). Sem configuração, o app roda em **modo demonstração**: os dados ficam no navegador e não há login.

## Ligar o Supabase (login e dados na nuvem)

1. Crie um projeto em [supabase.com](https://supabase.com/dashboard) (região South America / São Paulo).
2. **SQL Editor** → cole e rode `supabase/schema.sql`. Cria a tabela `records` com RLS (cada usuário só vê os próprios dados), os índices e liga o **Realtime** na tabela. Pode rodar de novo sem problema.
3. **Authentication → URL Configuration**: em *Site URL* coloque o endereço do sistema (ex.: `http://localhost:3001`) e adicione o mesmo em *Redirect URLs*. É para onde vão os links de confirmação de e-mail e de "Esqueci a senha".
4. Copie `.env.example` para `.env.local` e preencha com **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   - `SUPABASE_SERVICE_ROLE_KEY` (só no servidor; a rota que recebe o chat da extensão precisa dela).
5. Reinicie o `npm run dev`. Aparece a tela de login; crie a conta.
6. Ao entrar, o sistema oferece **importar os dados do modo demonstração** deste navegador (empresa, pregões, mensagens, propostas, análises…). A chave de ingestão vem junto, então a extensão continua conectada.
7. Confira em **Configurações → Conta e banco de dados**: o diagnóstico mostra se as chaves e a tabela estão certas.

Com o Supabase ligado:
- a extensão grava o chat direto no banco pela rota `/api/monitoramento/ingest` (não precisa mais deixar uma aba do PEPPACORP aberta);
- mensagens e alertas aparecem na tela na hora (Realtime), em qualquer aba ou computador logado;
- as coleções são lidas em páginas, sem o limite de 1.000 linhas por consulta do Supabase.

## Módulos

| Módulo | Situação |
|---|---|
| Dashboard (mercado em tempo real, gráfico de 14 dias, alertas, prazos) | ✅ |
| Oportunidades: busca no PNCP por termo, UF, modalidade e valor | ✅ |
| Radar: perfis de busca por cliente ou nicho | ✅ |
| Favoritos, CRM kanban (9 etapas) e Agenda automática | ✅ |
| Monitoramento: pregões, palavras-chave globais, busca retroativa, alertas | ✅ |
| Rota de ingestão do chat para a extensão (`POST /api/monitoramento/ingest`) | ✅ (com Supabase; no modo demonstração usa a aba aberta do PEPPACORP) |
| Extensão PEPPACORP Monitor (`extension/`) + tela Conectar Robô | ✅ |
| Propostas: itens do PNCP, preços, conferência/carta/descrições com IA (Claude ou Gemini), impressão em PDF e planilha | ✅ |
| Robô de lances, Inteligência de mercado, Atas, Documentos e IA de edital, Relatórios | Etapa 2 |

## Rota de ingestão do monitor

```
POST /api/monitoramento/ingest
x-ingest-key: <chave em Configurações>
{ "codigo_compra": "12345678901234", "messages": [ { "chaveMensagemNaOrigem": "...", "mensagem": "...", "dataHora": "..." } ] }
```

Resposta: `{ ok, synced, mentions[] }`, ou `not_monitored` / `encerrado`. As mensagens são deduplicadas por `codigo_compra:chaveMensagemNaOrigem`.

## Extensão PEPPACORP Monitor

Pasta `extension/` (Chrome/Edge, Manifest V3). Baixe em **Conectar Robô** (rota `GET /api/extensao` gera o .zip), carregue sem compactação e clique em “Conectar extensão”.

- `probe.js`: roda na página do Comprasnet e só repassa as respostas de `/comprasnet-mensagem/v2/chat/` que o próprio portal recebe.
- `monitor.js`: abre o painel Mensagens, percorre a paginação (página cheia = continua), deduplica por `chaveMensagemNaOrigem` e envia em fila com confirmação.
- `background.js`: envia para `/api/monitoramento/ingest`. Se o servidor responder 503 (modo demonstração), entrega à aba do PEPPACORP aberta pela ponte (`bridge.js` + `ExtensaoPonte`).

## Fontes de dados

- PNCP — API pública de consulta: `https://pncp.gov.br/api/consulta/v1`
