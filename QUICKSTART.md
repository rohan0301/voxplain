# Voxplain Quick Start Guide

This guide will walk you through setting up Voxplain on your local machine for development and testing.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download](https://git-scm.com/)

To check if you have these installed, run:
```bash
node --version
npm --version
git --version
```

## Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/voxplain.git
cd voxplain
```

## Step 2: Get API Keys

Voxplain requires API keys from external services. Follow these steps to get them:

### AssemblyAI API Key (Required for Transcription)

1. Go to [AssemblyAI](https://www.assemblyai.com/)
2. Click "Sign Up" and create a free account
3. After signing up, go to your [dashboard](https://app.assemblyai.com/)
4. Copy your API key from the dashboard (you'll see it on the main page)
5. Save this key - you'll need it in the next step

### Supabase Project (Required for Database & Storage)

1. Go to [Supabase](https://supabase.com/)
2. Click "Start your project" and sign up
3. Create a new project:
   - Choose a project name (e.g., "voxplain")
   - Set a strong database password
   - Choose your region
4. Wait for the project to be created (1-2 minutes)
5. In your project dashboard, go to **Settings → API**
6. Copy the following values:
   - **Project URL** - Copy the URL under "API URL"
   - **Service Role Key** - Copy the "service_role" key (starts with `eyJ...`)
   - **Anon Key** - Copy the "anon" key (also starts with `eyJ...`)

Keep these values handy for the next step.

### OpenAI API Key (Optional - for additional features)

If you want to use OpenAI features:
1. Go to [OpenAI API](https://platform.openai.com/)
2. Sign up or log in
3. Go to [API Keys](https://platform.openai.com/account/api-keys)
4. Create a new API key
5. Copy and save it

## Step 3: Install Dependencies

Install dependencies for both the client and server:

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Go back to the root directory
cd ..
```

## Step 4: Set Up Environment Variables

### Server Configuration

1. Navigate to the server directory:
```bash
cd server
```

2. Create a `.env` file by copying the example:
```bash
cp .env.example .env
```

3. Open `.env` in your text editor and fill in the values:
```
PORT=3000
NODE_ENV=development
ML_SERVICE_URL=http://localhost:8000
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ALLOWED_ORIGIN_PATTERNS=

# AssemblyAI Configuration
ASSEMBLYAI_API_KEY=your-assemblyai-api-key-here

# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
SUPABASE_RECORDINGS_BUCKET=recordings

# Optional: OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key-here
```

Replace the following with your actual values:
- `your-assemblyai-api-key-here` - Your AssemblyAI API key
- `https://your-project-id.supabase.co` - Your Supabase Project URL
- `your-supabase-service-role-key-here` - Your Supabase Service Role Key
- `your-openai-api-key-here` - Your OpenAI API key (optional)

### Client Configuration

1. Navigate to the client directory:
```bash
cd ../client
```

2. Create a `.env` file by copying the example:
```bash
cp .env.example .env
```

3. Open `.env` in your text editor and fill in the values:
```
VITE_API_URL=http://localhost:3000/api
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
```

Replace the following with your actual values:
- `https://your-project-id.supabase.co` - Your Supabase Project URL (same as server)
- `your-supabase-anon-key-here` - Your Supabase Anon Key

## Step 5: Run the Development Servers

You need to run both the server and client in separate terminal windows.

### Terminal 1: Start the Server

```bash
cd server
npm run dev
```

You should see output like:
```
Server running on http://localhost:3000
```

### Terminal 2: Start the Client

Open a new terminal window, then:

```bash
cd client
npm run dev
```

You should see output like:
```
Local:   http://localhost:5173/
```

## Step 6: Access Voxplain

Open your browser and navigate to:
```
http://localhost:5173
```

You should see the Voxplain interface. Try recording a short presentation to test that everything is working!

## Troubleshooting

### "Cannot find module" errors
Make sure you ran `npm install` in both the `server` and `client` directories.

### "API key is invalid" or transcription not working
Double-check that:
- Your AssemblyAI API key is correct in `server/.env`
- The key is not missing any characters
- You copied it directly from the AssemblyAI dashboard

### Supabase connection errors
Make sure:
- Your Supabase URL is correct (should be `https://your-project-id.supabase.co`)
- Your Service Role Key and Anon Key are correct
- Your Supabase project is active (check at supabase.com)

### "Port 3000 is already in use"
Change the PORT in `server/.env` to another number (e.g., `PORT=3001`) and update `VITE_API_URL` in `client/.env` accordingly.

### "Port 5173 is already in use"
Vite will automatically try the next available port. Check the terminal output for the correct URL.

### Still having issues?
- Check that Node.js v18+ is installed
- Make sure all environment variables are set correctly
- Try deleting `node_modules` and running `npm install` again
- Check the browser console (F12) for error messages

## Next Steps

- 🎤 Try recording a practice presentation
- 📊 Analyze your speech metrics
- 🔍 Review your transcript
- 🚀 Deploy to production (see DEPLOYMENT_PLAN.md)
- 🤝 Contribute to the project on GitHub

## API Keys Reference

If you need to retrieve your API keys later:

| Service | Where to Find |
|---------|---------------|
| AssemblyAI | [Dashboard](https://app.assemblyai.com/) |
| Supabase URL | Settings → API in your project |
| Supabase Keys | Settings → API in your project |
| OpenAI | [API Keys page](https://platform.openai.com/account/api-keys) |

## Environment Files Checklist

- ✅ `server/.env` - Created and filled with AssemblyAI and Supabase keys
- ✅ `client/.env` - Created and filled with Supabase keys
- ✅ Both keys match between client and server (URLs especially)
- ✅ No extra spaces or quotes around values

## Need Help?

- Review the [README.md](./README.md) for project overview
- Check `server/.env.example` and `client/.env.example` for required variables
- Open an issue on GitHub with details about your problem

Happy practicing! 🎤
