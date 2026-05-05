# Voxplain

An MVP tool for students to practice presentations by recording audio and getting a transcript + basic speech delivery stats.

## Tech Stack
- Client: React (Vite), TypeScript, TailwindCSS
- Server: Node.js, Express, TypeScript
- Processing: OpenAI Whisper (or Mock fallback), Music Metadata

## Prerequisites
- Node.js (v18+)
- OpenAI API Key (Optional. If not provided, the app runs in Mock Mode)

## Setup

1. **Install Dependencies**
   Run from root:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

2. **Environment Variables (Server)**
   Create `.env` in `server/`:
   ```bash
   cp server/.env.example server/.env
   ```
   Edit `.env` and add your `OPENAI_API_KEY` if you want real transcription.

3. **Run Development Servers**
   You need two terminals.

   Terminal 1 (Server):
   ```bash
   cd server
   npm run dev
   ```
   Server runs at `http://localhost:3000`.

   Terminal 2 (Client):
   ```bash
   cd client
   npm run dev
   ```
   Client runs at `http://localhost:5173`.

## Environment templates

- Client: [client/.env.example](/C:/Users/dgcam/OneDrive/Desktop/voxplain/client/.env.example)
- Server: [server/.env.example](/C:/Users/dgcam/OneDrive/Desktop/voxplain/server/.env.example)
- ML: [ml/.env.example](/C:/Users/dgcam/OneDrive/Desktop/voxplain/ml/.env.example)

## Deployment

- Vercel config for the client: [vercel.json](/C:/Users/dgcam/OneDrive/Desktop/voxplain/vercel.json)
- Render config for `server` and `ml`: [render.yaml](/C:/Users/dgcam/OneDrive/Desktop/voxplain/render.yaml)
- Supabase schema and storage setup: [supabase/recordings.sql](/C:/Users/dgcam/OneDrive/Desktop/voxplain/supabase/recordings.sql)
- Rollout notes: [DEPLOYMENT_PLAN.md](/C:/Users/dgcam/OneDrive/Desktop/voxplain/DEPLOYMENT_PLAN.md)

## Features
- **Record Audio**: Browser-based recording with timer.
- **Upload**: Support for mp3, wav, m4a.
- **Analysis**:
  - Words Per Minute (WPM)
  - Filler Word Detection (um, uh, like, etc.)
  - Actionable Tips based on metrics.
  - Transcript view with highlighting.

## Future Roadmap (Prompts)
- **Database**: Save reports for progress tracking.
- **Auth**: User accounts to manage history.
- **Video**: Analyze body language.
