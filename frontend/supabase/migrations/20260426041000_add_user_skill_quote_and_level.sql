alter table public.user_skills
add column if not exists user_quote text,
add column if not exists llm_level text;

