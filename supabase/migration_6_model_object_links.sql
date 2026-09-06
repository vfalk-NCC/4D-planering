-- 4D-planering / 4D-dashboard – migrering 6: koppling till objekt i
-- 3D-modellen för Hinder, Kvalitet/besiktningar och Säkerhet
-- ---------------------------------------------------------------------
-- Lägger till tre kolumner på plan_blockers, plan_inspections och
-- plan_safety_events, så att dashboarden kan koppla en rad till ett
-- specifikt objekt som användaren väljer direkt i 3D-modellen (via
-- Trimble Connect Workspace API), istället för till ett planerat objekt
-- i plan_items:
--   model_id           text    – id för modellen objektet valdes i
--   model_object_id    bigint  – objektets runtime-id i den modellen
--   model_object_name  text    – läsbart namn (t.ex. product.name),
--                                sparat vid valtillfället för att slippa
--                                fråga modellen på nytt bara för att visa
--                                namnet i dashboarden
--
-- plan_blockers och plan_inspections behåller sina befintliga kolumner
-- (plan_item_id m.fl.) orörda – dessa nya kolumner är ett tillägg vid
-- sidan av, inte en ersättning på databasnivå. plan_safety_events fick
-- ingen objektkoppling alls tidigare, så där är detta helt nytt.
--
-- Kör i Supabase: Dashboard -> SQL Editor -> New query -> klistra in
-- -> Run. Skriptet går att köra flera gånger utan att krascha
-- (add column if not exists).
-- ---------------------------------------------------------------------

alter table plan_blockers
  add column if not exists model_id text,
  add column if not exists model_object_id bigint,
  add column if not exists model_object_name text;

alter table plan_inspections
  add column if not exists model_id text,
  add column if not exists model_object_id bigint,
  add column if not exists model_object_name text;

alter table plan_safety_events
  add column if not exists model_id text,
  add column if not exists model_object_id bigint,
  add column if not exists model_object_name text;
