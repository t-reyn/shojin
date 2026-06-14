-- Onboarding baseline fields on profiles (additive, idempotent).
-- Collected by the first-run onboarding flow; all nullable so existing
-- users are untouched (they hit the "Welcome back" variant of the flow).
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists goal text;
alter table profiles add column if not exists days_per_week smallint;
alter table profiles add column if not exists onboarded_at timestamptz;

-- Guard rails (added separately so re-running on an already-migrated DB is safe).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_goal_check'
  ) then
    alter table profiles add constraint profiles_goal_check
      check (goal in ('muscle','strength','fat','consistent'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_days_per_week_check'
  ) then
    alter table profiles add constraint profiles_days_per_week_check
      check (days_per_week between 1 and 7);
  end if;
end $$;
