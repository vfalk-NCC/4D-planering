-- 4D-planering – migrering 2: kommentarer + framdriftsprocent
-- ---------------------------------------------------------------------
-- Kör bara detta skript om du redan har en fungerande databas sedan
-- tidigare (dvs. tabellen plan_items finns redan). Nya installationer
-- får allt detta automatiskt via schema.sql och behöver INTE köra den
-- här filen också.
--
-- Kör i Supabase: Dashboard -> SQL Editor -> New query -> klistra in
-- -> Run. Skriptet går att köra flera gånger utan att krascha.
-- ---------------------------------------------------------------------

-- Framdriftsprocent (0-100) per objekt.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'plan_items' and column_name = 'progress'
  ) then
    alter table plan_items add column progress integer not null default 0;
    alter table plan_items add constraint plan_items_progress_range check (progress >= 0 and progress <= 100);
  end if;
end $$;

-- Kommentarer (med svar) på ett planerat objekt.
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

alter table plan_item_comments enable row level security;

drop policy if exists "Allow anon full access" on plan_item_comments;
create policy "Allow anon full access"
  on plan_item_comments
  for all
  to anon
  using (true)
  with check (true);
