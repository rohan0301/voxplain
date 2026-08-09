# Legacy: account-based features

Voxplain has no sign-in. Anyone can open the site and use it; nothing is stored
server-side per person. This directory holds the code from when it *did* have
accounts, kept intact so that reversing the decision is a wiring job rather than
an archaeology job.

**None of this is mounted.** It compiles, and that is the point — if it stopped
compiling we would not notice until the day we wanted it back.

## What's here

- `recordings.routes.ts` — `GET/POST/DELETE /api/recordings`. Uploaded audio to
  a private Supabase Storage bucket under `<user_id>/`, with metadata and the
  analysis report in the `public.recordings` table. Exposed via
  `registerRecordingRoutes(app, upload)`, which nothing calls.

## Also still present, outside this directory

- `src/middleware/auth.ts` — Supabase JWT verification. Unused, still compiles.
- `src/lib/supabase.ts` — **still in use.** The labels endpoint writes through
  it. Do not delete.
- `client/src/hooks/useAuth.ts`, `client/src/components/AuthModal.tsx` — the
  sign-in UI. Unused; no component renders them.
- The `recordings` table, the `recordings` storage bucket, and their RLS
  policies in `supabase/recordings.sql` — left in place. Existing rows and audio
  are untouched, just unreachable from the app.

## To turn accounts back on

1. Mount the routes: `registerRecordingRoutes(app, upload)` in `src/index.ts`.
2. Put `requireAuth` back on `/api/labels` and restore the `user_id` on insert
   (it is currently hardcoded `null`), plus the `req.user?.id` 401 check.
3. Client: render `AuthModal` from `TopNav` again and restore the recordings
   sync in `client/src/api.ts`, which now reads and writes IndexedDB via
   `client/src/lib/recordingStore.ts`.

Note that `public.labels.user_id` is nullable, so anonymous rows collected in
the meantime stay valid — they just have no owner.
