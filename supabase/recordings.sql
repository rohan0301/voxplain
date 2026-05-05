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

alter table public.recordings enable row level security;

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
