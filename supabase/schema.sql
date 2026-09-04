-- 4D-planering – Supabase-schema
-- ---------------------------------------------------------------------
-- Kör hela detta skript EN gång i ditt Supabase-projekt:
-- Dashboard -> SQL Editor -> New query -> klistra in -> Run.
-- Skapar tabellen som extensionen lagrar all planeringsdata i.
-- ---------------------------------------------------------------------

create table if not exists plan_items (
  id bigint generated always as identity primary key,
  project_id text not null,
  model_id text,
  object_id text not null,
  object_name text,
  area text,
  activity text,
  contractor text,
  status text not null default 'planerad',
  start_date date,
  end_date date,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  updated_at timestamptz not null default now(),
  unique (project_id, object_id)
);

create index if not exists idx_plan_items_project on plan_items (project_id);

-- Kommentarer på ett planerat objekt (ungefär som cellkommentarer i Excel).
-- parent_comment_id är satt för svar på en annan kommentar, annars null.
create table if not exists plan_item_comments (
  id bigint generated always as identity primary key,
  plan_item_id bigint not null references plan_items (id) on delete cascade,
  parent_comment_id bigint references plan_item_comments (id) on delete cascade,
  author text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_item_comments_item on plan_item_comments (plan_item_id);
create index if not exists idx_plan_item_comments_parent on plan_item_comments (parent_comment_id);

-- Håller updated_at aktuell automatiskt vid varje ändring/upsert.
create or replace function set_plan_items_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_plan_items_updated_at on plan_items;
create trigger trg_plan_items_updated_at
  before update on plan_items
  for each row execute function set_plan_items_updated_at();

-- ---------------------------------------------------------------------
-- Rad-nivå-säkerhet (RLS)
-- ---------------------------------------------------------------------
-- Extensionen har ingen inloggning – den pratar med Supabase via den
-- publika "anon"-nyckeln, precis som en vanlig webbsida. Policyn nedan
-- tillåter alla som har din projekt-URL + anon-nyckel att läsa och
-- skriva planeringsdata.
--
-- OBS: dela inte anon-nyckeln utanför de personer som ska kunna använda
-- extensionen (den syns i klartext i extensionens inställningar/
-- localStorage hos varje användare). Vill du ha striktare kontroll
-- (t.ex. bara läsbehörighet för vissa, inloggning per användare) går det
-- att bygga vidare på detta med Supabase Auth + smalare policies senare.
alter table plan_items enable row level security;

drop policy if exists "Allow anon full access" on plan_items;
create policy "Allow anon full access"
  on plan_items
  for all
  to anon
  using (true)
  with check (true);

alter table plan_item_comments enable row level security;

drop policy if exists "Allow anon full access" on plan_item_comments;
create policy "Allow anon full access"
  on plan_item_comments
  for all
  to anon
  using (true)
  with check (true);
