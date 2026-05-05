# Voxplain Deployment Plan

## Recommended stack

- `client` on Vercel Hobby
- `server` on Render Free Web Service
- `ml` on Render Free Web Service
- Auth, Postgres, and Storage on Supabase Free

This split keeps the frontend on Vercel, where it fits naturally, and avoids forcing the audio upload and Python model workloads into Vercel Functions.

## Why this setup

- Vercel Hobby is free and excellent for the React client.
- Your current API accepts uploaded audio files and uses `multer`, local temp files, and `ffmpeg`, which is a more natural fit for a long-running Node service than a serverless upload route.
- The ML service already looks like a standalone Python API, so it can be deployed as its own service without rewriting the app.
- Supabase already exists in the codebase and is a strong fit for auth plus per-user recording storage.

## Important free-tier tradeoff

The fully free path will have cold starts:

- Render Free services spin down after 15 minutes of inactivity and can take about a minute to wake up.
- Supabase Free projects can be paused if inactive for long enough.

For a low-traffic personal launch, this is usually acceptable. It is not a polished production experience for frequent users.

## Next implementation steps

1. Supabase
- Create a bucket named `recordings`.
- Run [supabase/recordings.sql](/C:/Users/dgcam/OneDrive/Desktop/voxplain/supabase/recordings.sql).
- Set up Auth redirect URLs for local dev and Vercel.

2. ML service
- Use [render.yaml](/C:/Users/dgcam/OneDrive/Desktop/voxplain/render.yaml) to deploy `voxplain-ml`.
- Set `LOAD_BERT_MODEL=false` at first unless you plan to ship the local DistilBERT weights.
- Confirm `/health` returns `200`.

3. Node API
- Use [render.yaml](/C:/Users/dgcam/OneDrive/Desktop/voxplain/render.yaml) to deploy `voxplain-server`.
- Set `ML_SERVICE_URL` to the deployed ML service URL.
- Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ALLOWED_ORIGINS`.

4. Frontend
- Deploy `client` to Vercel.
- Set `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
- Add the Vercel domain to Supabase Auth allowed URLs.

5. Final launch pass
- Test signup, login, recording save, reload, delete, playback, transcript analysis, and audio download.
- Test a cold-start flow so you know the first-load behavior before sharing the link.

## If you want a cleaner production feel later

The first thing to upgrade would be moving `server` and `ml` off free sleeping services. Even a small paid service for those two pieces would remove most of the noticeable delay.

## Files added for deployment

- [render.yaml](/C:/Users/dgcam/OneDrive/Desktop/voxplain/render.yaml)
- [client/.env.example](/C:/Users/dgcam/OneDrive/Desktop/voxplain/client/.env.example)
- [server/.env.example](/C:/Users/dgcam/OneDrive/Desktop/voxplain/server/.env.example)
- [ml/.env.example](/C:/Users/dgcam/OneDrive/Desktop/voxplain/ml/.env.example)

## Publish checklist

1. In Supabase, run the SQL in [supabase/recordings.sql](/C:/Users/dgcam/OneDrive/Desktop/voxplain/supabase/recordings.sql).
2. In Render, create services from [render.yaml](/C:/Users/dgcam/OneDrive/Desktop/voxplain/render.yaml).
3. Copy env values from the three `.env.example` files into Vercel and Render.
4. Deploy the client on Vercel using the existing [vercel.json](/C:/Users/dgcam/OneDrive/Desktop/voxplain/vercel.json).
5. Set `ALLOWED_ORIGINS` on both backend services to your exact Vercel production URL.
6. Test login, recording save, playback, delete, transcript generation, and technicality analysis from the deployed URL.
