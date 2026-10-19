-- PEPPACORP LICITA — esquema do Supabase
-- Rode no SQL Editor do seu projeto Supabase (pode rodar de novo: é idempotente).
-- Cada coleção do app (empresa, pregoes, chat_messages, alerts, propostas, analises,
-- favoritos, crm_cards, radar_profiles, agenda_events, documentos) é guardada como
-- documento JSON na tabela `records`, separada por usuário (RLS).

create table if not exists public.records (
  user_id    uuid not null references auth.users(id) on delete cascade,
  collection text not null,
  id         text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

-- Leitura por coleção (o app carrega cada coleção ordenada pela data).
create index if not exists records_collection_idx on public.records (user_id, collection, created_at desc);
-- Extensão de monitoramento: acha a empresa pela chave de ingestão…
create index if not exists records_ingest_key_idx on public.records ((data->>'ingest_key')) where collection = 'empresa';
-- …e o pregão pelo código da compra no Comprasnet.
create index if not exists records_codigo_compra_idx on public.records (user_id, (data->>'codigo_compra')) where collection = 'pregoes';

alter table public.records enable row level security;

drop policy if exists "dono le" on public.records;
drop policy if exists "dono grava" on public.records;
drop policy if exists "dono altera" on public.records;
drop policy if exists "dono apaga" on public.records;

create policy "dono le"     on public.records for select using (auth.uid() = user_id);
create policy "dono grava"  on public.records for insert with check (auth.uid() = user_id);
create policy "dono altera" on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dono apaga"  on public.records for delete using (auth.uid() = user_id);

-- Tempo real: mensagens do chat e alertas gravados pela extensão aparecem na tela sem recarregar.
-- (O Realtime respeita o RLS: cada usuário só recebe as próprias linhas.)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;
