alter table public.profiles
add column if not exists region text,
add column if not exists country text,
add column if not exists sex text,
add column if not exists salary_importance smallint,
add column if not exists age integer;

alter table public.profiles
drop constraint if exists profiles_salary_importance_check;

alter table public.profiles
add constraint profiles_salary_importance_check
check (salary_importance is null or salary_importance between 1 and 10);

alter table public.profiles
drop constraint if exists profiles_age_check;

alter table public.profiles
add constraint profiles_age_check
check (age is null or age between 0 and 120);

