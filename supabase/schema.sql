-- IronLog schema. Paste into the Supabase SQL editor and run.
-- Safe to re-run: drops are guarded and seeds upsert by natural key.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type muscle_group as enum
    ('chest','back','legs','shoulders','arms','core');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_pattern as enum
    ('squat','hinge','lunge','horizontal_press','vertical_press',
     'horizontal_pull','vertical_pull','curl','triceps_extension','core','calf','other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles — one row per user, holds preferences
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  unit text not null default 'kg' check (unit in ('kg','lb')),
  default_rest_seconds int not null default 90,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- exercises — built-in catalog (user_id null) + user custom exercises
-- ---------------------------------------------------------------------------
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  muscle_group muscle_group not null,
  movement_pattern movement_pattern not null default 'other',
  equipment text not null default 'barbell',
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);
-- Built-in seeds are unique by name; user customs are unique per (user, name).
create unique index if not exists exercises_builtin_name
  on exercises (name) where user_id is null;
create unique index if not exists exercises_user_name
  on exercises (user_id, name) where user_id is not null;

-- ---------------------------------------------------------------------------
-- workouts + workout_sets
-- ---------------------------------------------------------------------------
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  name text not null default 'Workout',
  performed_at timestamptz not null default now(),
  duration_seconds int,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_perf on workouts (user_id, performed_at desc);

create table if not exists workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  workout_id uuid not null references workouts (id) on delete cascade,
  exercise_id uuid not null references exercises (id),
  set_index int not null default 0,
  weight numeric(7,2) not null default 0,
  reps int not null default 0,
  rpe numeric(3,1),
  is_warmup boolean not null default false,
  completed boolean not null default true
);
create index if not exists workout_sets_workout on workout_sets (workout_id);
create index if not exists workout_sets_user_ex on workout_sets (user_id, exercise_id);
-- Added for per-exercise unit support; run separately on existing DBs:
-- alter table workout_sets add column if not exists unit text not null default 'kg' check (unit in ('kg','lb'));

-- ---------------------------------------------------------------------------
-- templates + template_sets (planned targets)
-- ---------------------------------------------------------------------------
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists template_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  template_id uuid not null references templates (id) on delete cascade,
  exercise_id uuid not null references exercises (id),
  set_index int not null default 0,
  weight numeric(7,2) not null default 0,
  reps int not null default 0
);
create index if not exists template_sets_template on template_sets (template_id);

-- ---------------------------------------------------------------------------
-- bodyweight_entries
-- ---------------------------------------------------------------------------
create table if not exists bodyweight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  logged_on date not null default current_date,
  weight numeric(6,2) not null,
  unit text not null default 'kg' check (unit in ('kg','lb'))
);
create unique index if not exists bodyweight_user_day
  on bodyweight_entries (user_id, logged_on);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles            enable row level security;
alter table exercises           enable row level security;
alter table workouts            enable row level security;
alter table workout_sets        enable row level security;
alter table templates           enable row level security;
alter table template_sets       enable row level security;
alter table bodyweight_entries  enable row level security;

-- Helper to (re)create a policy idempotently
do $$
declare t text;
begin
  -- profiles: owner-only
  drop policy if exists profiles_rw on profiles;
  create policy profiles_rw on profiles
    using (id = auth.uid ()) with check (id = auth.uid ());

  -- exercises: read built-ins (null user) OR own; write only own
  drop policy if exists exercises_read on exercises;
  create policy exercises_read on exercises for select
    using (user_id is null or user_id = auth.uid ());
  drop policy if exists exercises_insert on exercises;
  create policy exercises_insert on exercises for insert
    with check (user_id = auth.uid ());
  drop policy if exists exercises_update on exercises;
  create policy exercises_update on exercises for update
    using (user_id = auth.uid ()) with check (user_id = auth.uid ());
  drop policy if exists exercises_delete on exercises;
  create policy exercises_delete on exercises for delete
    using (user_id = auth.uid ());

  -- the owner-only tables share the same shape
  foreach t in array array['workouts','workout_sets','templates','template_sets','bodyweight_entries']
  loop
    execute format('drop policy if exists %I_rw on %I', t, t);
    execute format(
      'create policy %I_rw on %I using (user_id = auth.uid ()) with check (user_id = auth.uid ())',
      t, t);
  end loop;
end $$;

-- Auto-create a profile row on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Seed built-in exercises (user_id null). Upsert by name.
-- ---------------------------------------------------------------------------
insert into exercises (name, muscle_group, movement_pattern, equipment) values
  ('Back Squat',                 'legs',      'squat',              'barbell'),
  ('Front Squat',                'legs',      'squat',              'barbell'),
  ('Pause Squat (Barbell)',      'legs',      'squat',              'barbell'),
  ('Leg Press',                  'legs',      'squat',              'machine'),
  ('Romanian Deadlift',          'legs',      'hinge',              'barbell'),
  ('Deadlift',                   'back',      'hinge',              'barbell'),
  ('Sumo Deadlift',              'legs',      'hinge',              'barbell'),
  ('Back Extension',             'back',      'hinge',              'machine'),
  ('Walking Lunge',              'legs',      'lunge',              'dumbbell'),
  ('Reverse Lunge',              'legs',      'lunge',              'dumbbell'),
  ('Step Up',                    'legs',      'lunge',              'dumbbell'),
  ('Bulgarian Split Squat',      'legs',      'lunge',              'dumbbell'),
  ('Bulgarian Split Squat (Barbell)', 'legs', 'lunge',              'barbell'),
  ('Pistol Squat',               'legs',      'squat',              'bodyweight'),
  ('Leg Press (Single-Leg)',      'legs',      'squat',              'machine'),
  ('Romanian Deadlift (Single-Leg)', 'legs',  'hinge',              'dumbbell'),
  ('Back Extension (Single-Leg)', 'back',     'hinge',              'machine'),
  ('Standing Calf Raise',        'legs',      'calf',               'machine'),
  ('Standing Calf Raise (Single-Leg)', 'legs','calf',               'bodyweight'),
  ('Seated Calf Raise',          'legs',      'calf',               'machine'),
  ('Bench Press (Barbell)',      'chest',     'horizontal_press',   'barbell'),
  ('Incline Bench Press',        'chest',     'horizontal_press',   'barbell'),
  ('Dumbbell Bench Press',       'chest',     'horizontal_press',   'dumbbell'),
  ('Push Up',                    'chest',     'horizontal_press',   'bodyweight'),
  ('Cable Fly',                  'chest',     'horizontal_press',   'cable'),
  ('Overhead Press (Barbell)',   'shoulders', 'vertical_press',     'barbell'),
  ('Dumbbell Shoulder Press',    'shoulders', 'vertical_press',     'dumbbell'),
  ('Lateral Raise',             'shoulders', 'vertical_press',     'dumbbell'),
  ('Lat Pulldown (Cable)',       'back',      'vertical_pull',      'cable'),
  ('Pull Up',                    'back',      'vertical_pull',      'bodyweight'),
  ('Barbell Row',                'back',      'horizontal_pull',    'barbell'),
  ('Seated Cable Row',           'back',      'horizontal_pull',    'cable'),
  ('Dumbbell Row',               'back',      'horizontal_pull',    'dumbbell'),
  ('Face Pull',                  'shoulders', 'horizontal_pull',    'cable'),
  ('Barbell Curl',               'arms',      'curl',               'barbell'),
  ('Dumbbell Curl',              'arms',      'curl',               'dumbbell'),
  ('Hammer Curl',                'arms',      'curl',               'dumbbell'),
  ('Triceps Pushdown',           'arms',      'triceps_extension',  'cable'),
  ('Skullcrusher',               'arms',      'triceps_extension',  'barbell'),
  ('Plank',                      'core',      'core',               'bodyweight'),
  ('Hanging Leg Raise',          'core',      'core',               'bodyweight'),
  ('Cable Crunch',               'core',      'core',               'cable'),
  -- Machine exercises
  ('Machine Chest Press',        'chest',     'horizontal_press',   'machine'),
  ('Machine Fly',                'chest',     'horizontal_press',   'machine'),
  ('Pec Deck',                   'chest',     'horizontal_press',   'machine'),
  ('Machine Shoulder Press',     'shoulders', 'vertical_press',     'machine'),
  ('Hack Squat',                 'legs',      'squat',              'machine'),
  ('Leg Extension',              'legs',      'other',              'machine'),
  ('Leg Curl',                   'legs',      'hinge',              'machine'),
  ('Machine Row',                'back',      'horizontal_pull',    'machine'),
  -- Chest
  ('Decline Bench Press',               'chest',     'horizontal_press',   'barbell'),
  ('Incline Dumbbell Press',            'chest',     'horizontal_press',   'dumbbell'),
  ('Dumbbell Fly',                      'chest',     'horizontal_press',   'dumbbell'),
  ('Dumbbell Bench Press (Single Arm)', 'chest',     'horizontal_press',   'dumbbell'),
  ('Cable Crossover',                   'chest',     'horizontal_press',   'cable'),
  ('Cable Fly (Single Arm)',            'chest',     'horizontal_press',   'cable'),
  ('Incline Cable Fly',                 'chest',     'horizontal_press',   'cable'),
  ('Dips (Chest)',                      'chest',     'horizontal_press',   'bodyweight'),
  ('Incline Chest Press (Machine)',     'chest',     'horizontal_press',   'machine'),
  -- Back
  ('Chin Up',                           'back',      'vertical_pull',      'bodyweight'),
  ('Neutral Grip Pull Up',              'back',      'vertical_pull',      'bodyweight'),
  ('Lat Pulldown (Single Arm)',         'back',      'vertical_pull',      'cable'),
  ('Straight Arm Pulldown',             'back',      'vertical_pull',      'cable'),
  ('Assisted Pull Up (Machine)',        'back',      'vertical_pull',      'machine'),
  ('T-Bar Row',                         'back',      'horizontal_pull',    'barbell'),
  ('Pendlay Row',                       'back',      'horizontal_pull',    'barbell'),
  ('Cable Row (Single Arm)',            'back',      'horizontal_pull',    'cable'),
  ('Chest Supported Row (Machine)',     'back',      'horizontal_pull',    'machine'),
  ('Low Row (Machine)',                  'back',      'horizontal_pull',    'machine'),
  ('High Row (Machine)',                 'back',      'horizontal_pull',    'machine'),
  ('Rear Delt Fly (Machine)',           'back',      'horizontal_pull',    'machine'),
  -- Shoulders
  ('Arnold Press',                      'shoulders', 'vertical_press',     'dumbbell'),
  ('Overhead Press (Single Arm)',       'shoulders', 'vertical_press',     'dumbbell'),
  ('Front Raise',                       'shoulders', 'vertical_press',     'dumbbell'),
  ('Cable Lateral Raise (Single Arm)', 'shoulders', 'vertical_press',     'cable'),
  ('Machine Lateral Raise',             'shoulders', 'vertical_press',     'machine'),
  ('Rear Delt Fly',                     'shoulders', 'horizontal_pull',    'dumbbell'),
  ('Upright Row',                       'shoulders', 'vertical_pull',      'barbell'),
  -- Arms
  ('EZ Bar Curl',                       'arms',      'curl',               'barbell'),
  ('Cable Curl',                        'arms',      'curl',               'cable'),
  ('Cable Curl (Single Arm)',           'arms',      'curl',               'cable'),
  ('Preacher Curl',                     'arms',      'curl',               'barbell'),
  ('Preacher Curl (Machine)',           'arms',      'curl',               'machine'),
  ('Concentration Curl',                'arms',      'curl',               'dumbbell'),
  ('Incline Dumbbell Curl',             'arms',      'curl',               'dumbbell'),
  ('Bicep Curl (Machine)',              'arms',      'curl',               'machine'),
  ('Close Grip Bench Press',            'arms',      'triceps_extension',  'barbell'),
  ('Overhead Triceps Extension',        'arms',      'triceps_extension',  'dumbbell'),
  ('Cable Overhead Triceps Extension', 'arms',      'triceps_extension',  'cable'),
  ('Triceps Pushdown (Single Arm)',     'arms',      'triceps_extension',  'cable'),
  ('Tricep Extension (Machine)',        'arms',      'triceps_extension',  'machine'),
  ('Dips (Triceps)',                    'arms',      'triceps_extension',  'bodyweight'),
  -- Legs
  ('Goblet Squat',                      'legs',      'squat',              'dumbbell'),
  ('Box Squat',                         'legs',      'squat',              'barbell'),
  ('Smith Machine Squat',               'legs',      'squat',              'machine'),
  ('Hip Thrust',                        'legs',      'hinge',              'barbell'),
  ('Hip Thrust (Single Leg)',           'legs',      'hinge',              'barbell'),
  ('Hip Thrust (Machine)',              'legs',      'hinge',              'machine'),
  ('Glute Bridge',                      'legs',      'hinge',              'bodyweight'),
  ('Glute Bridge (Single Leg)',         'legs',      'hinge',              'bodyweight'),
  ('Good Morning',                      'legs',      'hinge',              'barbell'),
  ('Nordic Curl',                       'legs',      'hinge',              'bodyweight'),
  ('Leg Extension (Single Leg)',        'legs',      'other',              'machine'),
  ('Leg Curl (Single Leg)',             'legs',      'hinge',              'machine'),
  ('Glute Kickback (Machine)',          'legs',      'hinge',              'machine'),
  ('Hip Abduction (Machine)',           'legs',      'other',              'machine'),
  ('Hip Adduction (Machine)',           'legs',      'other',              'machine'),
  -- Core
  ('Ab Wheel Rollout',                  'core',      'core',               'bodyweight'),
  ('Dead Bug',                          'core',      'core',               'bodyweight'),
  ('Side Plank',                        'core',      'core',               'bodyweight'),
  ('Pallof Press',                      'core',      'core',               'cable'),
  ('Russian Twist',                     'core',      'core',               'bodyweight'),
  ('Decline Sit Up',                    'core',      'core',               'bodyweight'),
  ('Abdominal Crunch (Machine)',        'core',      'core',               'machine')
on conflict (name) where user_id is null do update
  set muscle_group = excluded.muscle_group,
      movement_pattern = excluded.movement_pattern,
      equipment = excluded.equipment;

-- ---------------------------------------------------------------------------
-- feedback — user suggestions (exercises, features). Dev reads via service role.
-- ---------------------------------------------------------------------------
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  message text not null,
  custom_exercises jsonb,
  created_at timestamptz not null default now()
);
alter table feedback enable row level security;
do $$
begin
  drop policy if exists feedback_insert on feedback;
  create policy feedback_insert on feedback for insert
    with check (user_id = auth.uid ());
  drop policy if exists feedback_select on feedback;
  create policy feedback_select on feedback for select
    using (user_id = auth.uid ());
end $$;
