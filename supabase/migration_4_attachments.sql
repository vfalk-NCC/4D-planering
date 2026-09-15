-- 4D-planering / 4D-dashboard – migrering 4: bilagor (PDF/bilder)
-- ---------------------------------------------------------------------
-- Lägger till stöd för att bifoga en fil (PDF eller bild) på varje
-- säkerhetshändelse och besiktning: två nya kolumner på befintliga
-- tabeller + en publik Storage-bucket med samma "anon full access"-
-- policy som resten av databasen använder.
--
-- Kör i Supabase: Dashboard -> SQL Editor -> New query -> klistra in
-- -> Run. Skriptet går att köra flera gånger utan att krascha
-- (if not exists / drop-and-recreate på policies).
-- ---------------------------------------------------------------------

-- =======================================================================
-- 1. Nya kolumner för bilaga-URL + originalfilnamn
-- -----------------------------------------------------------------------
alter table plan_safety_events
  add column if not exists attachment_url text,
  add column if not exists attachment_name text;

alter table plan_inspections
  add column if not exists attachment_url text,
  add column if not exists attachment_name text;

-- =======================================================================
-- 2. Storage-bucket för bilagorna
-- -----------------------------------------------------------------------
-- "public = true" gör att uppladdade filer kan nås via en enkel publik
-- URL (samma mönster som anon-nyckeln redan används för att läsa/skriva
-- tabelldata) – ingen extra inloggning behövs för att visa en bilaga i
-- dashboarden.
insert into storage.buckets (id, name, public)
values ('dashboard-attachments', 'dashboard-attachments', true)
on conflict (id) do update set public = true;

-- Tillåt anon (dvs. dashboarden, precis som för tabellerna ovan) att
-- ladda upp, läsa och ta bort filer i just den här bucketen.
drop policy if exists "Allow anon full access to dashboard-attachments" on storage.objects;
create policy "Allow anon full access to dashboard-attachments"
  on storage.objects for all
  to anon
  using (bucket_id = 'dashboard-attachments')
  with check (bucket_id = 'dashboard-attachments');
