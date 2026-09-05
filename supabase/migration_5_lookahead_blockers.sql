-- 4D-planering / 4D-dashboard – migrering 5: 4-veckors lookahead, Hinder
-- och Leveransplan handlingar
-- ---------------------------------------------------------------------
-- Lägger till:
--  1. planned_headcount på plan_staffing (planerad bemanning, vid sidan
--     av den befintliga headcount-kolumnen som nu är "faktisk bemanning").
--  2. plan_blockers + plan_blocker_comments – ny "Hinder"-panel med en
--     egen kommentarstråd per hinder.
--  3. plan_document_deliveries – ny "Leveransplan handlingar"-panel,
--     samma struktur som plan_deliveries men för dokument/handlingar
--     (ritningar, bygglov, tekniska beskrivningar). actual_date fanns
--     redan på plan_deliveries sedan migration_3 men läggs till här för
--     tydlighetens skull också (if not exists, gör ingenting om den
--     redan finns).
--
-- Kör i Supabase: Dashboard -> SQL Editor -> New query -> klistra in
-- -> Run. Skriptet går att köra flera gånger utan att krascha
-- (if not exists / drop-and-recreate på policies).
-- ---------------------------------------------------------------------

-- =======================================================================
-- 1. Bemanning: planerad bemanning vid sidan av faktisk (headcount)
-- -----------------------------------------------------------------------
alter table plan_staffing
  add column if not exists planned_headcount integer check (planned_headcount >= 0);

-- actual_date finns redan sedan migration_3_dashboard_features.sql, men
-- läggs till här igen (if not exists) ifall den migreringen av någon
-- anledning inte körts.
alter table plan_deliveries
  add column if not exists actual_date date;

-- =======================================================================
-- 2. Hinder (blockers)
-- -----------------------------------------------------------------------
create table if not exists plan_blockers (
  id bigint generated always as identity primary key,
  project_id text not null,
  description text not null,
  plan_item_id bigint,
  affected_item_ids bigint[] not null default '{}',
  responsible text,
  deadline date,
  production_impact text,
  is_resolved boolean not null default false,
  resolved_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plan_blockers enable row level security;
drop policy if exists "Allow anon full access" on plan_blockers;
create policy "Allow anon full access" on plan_blockers
  for all to anon using (true) with check (true);

-- Egen kommentarstråd per hinder (separat från plan_item_comments, som
-- dashboarden bara läser). Ingen egen project_id-kolumn – kopplas via
-- blocker_id, precis som plan_item_comments kopplas via plan_item_id.
create table if not exists plan_blocker_comments (
  id bigint generated always as identity primary key,
  blocker_id bigint not null references plan_blockers(id) on delete cascade,
  body text not null,
  author text,
  created_at timestamptz not null default now()
);

alter table plan_blocker_comments enable row level security;
drop policy if exists "Allow anon full access" on plan_blocker_comments;
create policy "Allow anon full access" on plan_blocker_comments
  for all to anon using (true) with check (true);

-- =======================================================================
-- 3. Leveransplan handlingar (dokument/handlingar: ritningar, bygglov,
--    tekniska beskrivningar) – samma struktur som plan_deliveries.
-- -----------------------------------------------------------------------
create table if not exists plan_document_deliveries (
  id bigint generated always as identity primary key,
  project_id text not null,
  description text not null,
  supplier text,
  contractor text,
  area text,
  planned_date date not null,
  actual_date date,
  status text not null default 'planerad',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plan_document_deliveries enable row level security;
drop policy if exists "Allow anon full access" on plan_document_deliveries;
create policy "Allow anon full access" on plan_document_deliveries
  for all to anon using (true) with check (true);
