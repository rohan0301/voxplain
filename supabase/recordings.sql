create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

create table if not exists public.recordings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    project_id text,
    project_name text,
    recorded_at timestamptz not null default timezone('utc', now()),
    audio_path text not null,
    audio_mime_type text,
    file_name text,
    report jsonb not null,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists recordings_user_recorded_at_idx
    on public.recordings (user_id, recorded_at desc);

create table if not exists public.projects (
    id text not null,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    last_modified timestamptz not null default timezone('utc', now()),
    estimated_time_sec integer not null default 0,
    required_time_sec integer,
    audience text,
    presentation_type text,
    speech_text text,
    audience_level integer,
    domain text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    primary key (user_id, id)
);

create index if not exists projects_user_updated_at_idx
    on public.projects (user_id, updated_at desc);

create table if not exists public.speeches (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    project_id text,
    project_name text,
    title text,
    content text not null,
    word_count integer not null default 0,
    audience_level integer,
    domain text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists speeches_user_created_at_idx
    on public.speeches (user_id, created_at desc);

create index if not exists speeches_user_project_created_at_idx
    on public.speeches (user_id, project_id, created_at desc);

-- Training labels for the audience/technicality model.
-- user_id is nullable and set null on delete: a departed user's labels stay
-- usable as training data even though the account is gone.
create table if not exists public.labels (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    text text not null,
    label smallint not null check (label in (0, 1)),
    audience_level smallint check (audience_level between 0 and 3),
    domain text not null default 'general',
    project_id text,
    source text not null default 'human' check (source in ('human', 'synthetic', 'heuristic')),
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists labels_created_at_idx
    on public.labels (created_at desc);

create index if not exists labels_level_domain_idx
    on public.labels (audience_level, domain);

alter table public.recordings enable row level security;
alter table public.projects enable row level security;
alter table public.speeches enable row level security;
alter table public.labels enable row level security;

drop policy if exists "Users can view their own projects" on public.projects;
create policy "Users can view their own projects"
    on public.projects
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can insert their own projects" on public.projects;
create policy "Users can insert their own projects"
    on public.projects
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects"
    on public.projects
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects"
    on public.projects
    for delete
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can view their own recordings" on public.recordings;
create policy "Users can view their own recordings"
    on public.recordings
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can insert their own recordings" on public.recordings;
create policy "Users can insert their own recordings"
    on public.recordings
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own recordings" on public.recordings;
create policy "Users can delete their own recordings"
    on public.recordings
    for delete
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can view their own speeches" on public.speeches;
create policy "Users can view their own speeches"
    on public.speeches
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can insert their own speeches" on public.speeches;
create policy "Users can insert their own speeches"
    on public.speeches
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own speeches" on public.speeches;
create policy "Users can update their own speeches"
    on public.speeches
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own speeches" on public.speeches;
create policy "Users can delete their own speeches"
    on public.speeches
    for delete
    to authenticated
    using (auth.uid() = user_id);

-- The server writes labels with the service role, which bypasses RLS entirely.
-- This policy is defense-in-depth for any future direct-from-client write; the
-- auth check in the /api/labels handler is what actually guards the table today.
-- No select policy: only the service role reads the full set, for training.
drop policy if exists "Users can insert their own labels" on public.labels;
create policy "Users can insert their own labels"
    on public.labels
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own recording objects" on storage.objects;
create policy "Users can manage their own recording objects"
    on storage.objects
    for all
    to authenticated
    using (
        bucket_id = 'recordings'
        and auth.uid()::text = (storage.foldername(name))[1]
    )
    with check (
        bucket_id = 'recordings'
        and auth.uid()::text = (storage.foldername(name))[1]
    );
