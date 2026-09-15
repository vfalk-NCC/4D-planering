-- 4D-planering / 4D-dashboard – migrering 3: dashboard-funktioner
-- ---------------------------------------------------------------------
-- Lägger till stöd för: S-kurva (framdriftshistorik), milstolpar,
-- bemanning, leveransplan, säkerhet och kvalitet/besiktningar.
-- Väder kräver ingen tabell (se README/förslagsdokumentet).
--
-- Kör i Supabase: Dashboard -> SQL Editor -> New query -> klistra in
-- -> Run. Skriptet går att köra flera gånger utan att krascha
-- (if not exists / drop-and-recreate på triggers och policies).
-- ---------------------------------------------------------------------

-- =======================================================================
-- 1. S-kurva: automatisk framdriftshistorik
-- -----------------------------------------------------------------------
-- En rad loggas automatiskt varje gång ett objekt skapas eller när
-- progress/status ändras i plan_items. Ingen manuell inmatning behövs –
-- detta drivs helt av en trigger på plan_items, så varken 4D-planering
-- eller 4D-dashboard behöver ändras för att historiken ska fyllas på.
-- =======================================================================

create table if not exists plan_item_progress_history (
  id bigint generated always as identity primary key,
  plan_item_id bigint not null references plan_items (id) on delete cascade,
  project_id text not null,
  progress integer not null check (progress >= 0 and progress <= 100),
  status text not null,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_progress_history_project_time
  on plan_item_progress_history (project_id, recorded_at);
create index if not exists idx_progress_history_item
  on plan_item_progress_history (plan_item_id);

create or replace function log_plan_item_progress()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT')
     or (new.progress is distinct from old.progress)
     or (new.status is distinct from old.status) then
    insert into plan_item_progress_history (plan_item_id, project_id, progress, status)
    values (new.id, new.project_id, new.progress, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_plan_items_progress_history on plan_items;
create trigger trg_plan_items_progress_history
  after insert or update on plan_items
  for each row execute function log_plan_item_progress();

alter table plan_item_progress_history enable row level security;
drop policy if exists "Allow anon full access" on plan_item_progress_history;
create policy "Allow anon full access"
  on plan_item_progress_history for all to anon using (true) with check (true);

-- =======================================================================
-- 2. Milstolpar
-- =======================================================================

create table if not exists plan_milestones (
  id bigint generated always as identity primary key,
  project_id text not null,
  name text not null,
  target_date date not null,
  is_done boolean not null default false,
  completed_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_milestones_project on plan_milestones (project_id, target_date);

create or replace function set_plan_milestones_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_plan_milestones_updated_at on plan_milestones;
create trigger trg_plan_milestones_updated_at
  before update on plan_milestones
  for each row execute function set_plan_milestones_updated_at();

alter table plan_milestones enable row level security;
drop policy if exists "Allow anon full access" on plan_milestones;
create policy "Allow anon full access"
  on plan_milestones for all to anon using (true) with check (true);

-- =======================================================================
-- 3. Bemanning per entreprenör och vecka
-- =======================================================================

create table if not exists plan_staffing (
  id bigint generated always as identity primary key,
  project_id text not null,
  contractor text not null,
  week_start date not null,          -- måndagen i ISO-veckan
  headcount integer not null check (headcount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, contractor, week_start)
);

create index if not exists idx_staffing_project_week on plan_staffing (project_id, week_start);

create or replace function set_plan_staffing_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_plan_staffing_updated_at on plan_staffing;
create trigger trg_plan_staffing_updated_at
  before update on plan_staffing
  for each row execute function set_plan_staffing_updated_at();

alter table plan_staffing enable row level security;
drop policy if exists "Allow anon full access" on plan_staffing;
create policy "Allow anon full access"
  on plan_staffing for all to anon using (true) with check (true);

-- =======================================================================
-- 4. Leveransplan
-- =======================================================================

create table if not exists plan_deliveries (
  id bigint generated always as identity primary key,
  project_id text not null,
  description text not null,
  supplier text,
  contractor text,
  area text,
  planned_date date not null,
  actual_date date,
  status text not null default 'planerad',  -- planerad / på väg / levererad / försenad
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deliveries_project_date on plan_deliveries (project_id, planned_date);

create or replace function set_plan_deliveries_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_plan_deliveries_updated_at on plan_deliveries;
create trigger trg_plan_deliveries_updated_at
  before update on plan_deliveries
  for each row execute function set_plan_deliveries_updated_at();

alter table plan_deliveries enable row level security;
drop policy if exists "Allow anon full access" on plan_deliveries;
create policy "Allow anon full access"
  on plan_deliveries for all to anon using (true) with check (true);

-- =======================================================================
-- 5. Säkerhet (tillbud, skyddsronder, riskobservationer)
-- =======================================================================

create table if not exists plan_safety_events (
  id bigint generated always as identity primary key,
  project_id text not null,
  event_type text not null,   -- 'tillbud' / 'olycka' / 'skyddsrond' / 'riskobservation'
  severity text,               -- 'låg' / 'medel' / 'hög' (valfritt)
  description text,
  area text,
  contractor text,
  event_date date not null default current_date,
  reported_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_safety_project_date on plan_safety_events (project_id, event_date);

alter table plan_safety_events enable row level security;
drop policy if exists "Allow anon full access" on plan_safety_events;
create policy "Allow anon full access"
  on plan_safety_events for all to anon using (true) with check (true);

-- =======================================================================
-- 6. Kvalitet / besiktningar
-- =======================================================================

create table if not exists plan_inspections (
  id bigint generated always as identity primary key,
  project_id text not null,
  plan_item_id bigint references plan_items (id) on delete set null,
  inspection_type text not null,  -- 'egenkontroll' / 'besiktning' / 'slutbesiktning' / 'myndighetsbesiktning'
  result text,                     -- 'godkänd' / 'anmärkning' / 'underkänd'
  comment text,
  inspected_by text,
  inspected_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_inspections_project_date on plan_inspections (project_id, inspected_at);
create index if not exists idx_inspections_item on plan_inspections (plan_item_id);

alter table plan_inspections enable row level security;
drop policy if exists "Allow anon full access" on plan_inspections;
create policy "Allow anon full access"
  on plan_inspections for all to anon using (true) with check (true);
