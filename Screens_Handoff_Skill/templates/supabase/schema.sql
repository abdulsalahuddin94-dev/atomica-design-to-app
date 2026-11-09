-- Live Prototype comments (Screens_Handoff_Skill, step 4). Run once in the Supabase SQL Editor of the test project.
-- One Supabase project serves every Atomica project: rows are kept apart by their project slug (the prototype sends
-- its own, tools/prototype_comments.cjs reads only its project's rows). Run once; new projects need no Supabase step.
-- Reviewers post from the public prototype with the anon key: they can add open comments and read comments. Nobody
-- with the anon key can change or delete a comment; triage (--pull) and --resolve use the service key, which stays in
-- the owner's ~/.atomica/supabase.env and bypasses these policies. Safe to run again (it replaces the policies and
-- keeps every comment). Also creates the public Storage bucket prototype-comments for reference images.

create table if not exists public.prototype_comments (
  id          uuid primary key default gen_random_uuid(),
  project     text not null,
  screen      text not null,                    -- prototype screen slug (e.g. now-playing)
  figma_node  text,                             -- data-figma-node of the element (Figma node id in the Design file)
  component   text,                             -- DS component name, or the frame name
  theme       text check (theme in ('Light', 'Dark')),
  lang        text check (lang in ('en', 'ar')),
  viewport    text,                             -- e.g. "desktop 1280x900" / "phone 390x844"
  x           real,                             -- pin position in the screen, Figma pixels
  y           real,
  author      text check (char_length(author) <= 80),
  body        text not null check (char_length(body) between 1 and 2000),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists prototype_comments_project_screen on public.prototype_comments (project, screen, created_at);

alter table public.prototype_comments enable row level security;

drop policy if exists "anon reads this project's comments" on public.prototype_comments;
drop policy if exists "anon adds open comments to this project" on public.prototype_comments;
drop policy if exists "anon reads prototype comments" on public.prototype_comments;
create policy "anon reads prototype comments" on public.prototype_comments
  for select to anon
  using (project ~ '^[a-z0-9-]{1,64}$');

drop policy if exists "anon adds open prototype comments" on public.prototype_comments;
create policy "anon adds open prototype comments" on public.prototype_comments
  for insert to anon
  with check (project ~ '^[a-z0-9-]{1,64}$' and status = 'open' and resolved_at is null);

-- The design team's answer, written with --resolve <id> --reply "..." (service key); reviewers see it under the comment.
alter table public.prototype_comments add column if not exists reply text check (char_length(reply) <= 2000);

-- Reference images of a comment (up to 4): storage paths <project>/<comment id>/<n>.webp in the bucket below.
alter table public.prototype_comments add column if not exists images text[] not null default '{}';
do $$ begin
  alter table public.prototype_comments add constraint prototype_comments_images_max check (cardinality(images) <= 4);
exception when duplicate_object then null; end $$;

-- Storage for those images: public read (the links work in the prototype and the triage), anon may only add images
-- (png / jpeg / webp / gif, at most 5 MB) under <project slug>/<comment id>/; no anon update or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prototype-comments', 'prototype-comments', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anon adds prototype comment images" on storage.objects;
create policy "anon adds prototype comment images" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'prototype-comments'
    and (storage.foldername(name))[1] ~ '^[a-z0-9-]{1,64}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and cardinality(storage.foldername(name)) = 2
  );

-- No update or delete policy for anon: with RLS on, those are refused.
revoke update, delete, truncate on public.prototype_comments from anon;
grant select, insert on public.prototype_comments to anon;
