# Deploying Procurement Auditor (100% free)

This guide deploys the **whole app** — FastAPI backend + React frontend + a Postgres
(pgvector) database — using **free tiers** and **open-source tools**. No credit card.

You have two paths. Pick one:

- **Path A — Cloud (recommended, all in the browser).** Supabase + Render + Vercel + Groq.
  Best if you want a public URL and don't want to run a server yourself.
- **Path B — Docker (fully self-hosted, open source).** One command on your own machine.
  Best if you want everything local / on your own hardware.

---

## The stack

| Piece | Path A (Cloud, free tier) | Path B (Docker, open source) |
|-------|---------------------------|------------------------------|
| Database (Postgres + pgvector) | **Supabase** | `pgvector/pgvector` image |
| Backend (FastAPI) | **Render** | `python:3.11-slim` container |
| Frontend (React/Vite) | **Vercel** | `nginx` container |
| LLM extraction | **Groq** (free API key) | **Groq** (free API key) |
| Escalation emails (optional) | Gmail App Password | Gmail App Password |

> The app degrades gracefully: if you skip Groq, PDF extraction is skipped; if you skip
> Gmail, escalation emails are skipped. Nothing crashes.

---

## Prerequisites (both paths)

1. **Git** installed — https://git-scm.com/downloads
2. A **GitHub** account — https://github.com/signup (you'll log in to Render/Vercel with it)
3. A **Groq API key** (free):
   - Go to https://console.groq.com and click **Log In** (sign in with Google/GitHub).
   - Left sidebar → **API Keys** → **Create API Key** → name it `procurement` → **Submit**.
   - **Copy the key now** (it's shown once). Keep it somewhere safe.
4. *(Optional)* **Gmail App Password** for escalation emails:
   - Enable 2-Step Verification: https://myaccount.google.com/security
   - Then https://myaccount.google.com/apppasswords → create an app password → copy the
     16-character value.

---

# Step 0 — Push the code to GitHub (both paths)

Open a terminal in the project root (`procurement-auditor`) and run:

```powershell
git init
git add .
git commit -m "Initial commit"
```

Now create the remote repo:

1. Go to https://github.com/new
2. **Repository name**: `procurement-auditor`
3. Choose **Private** (or Public — your call). **Do NOT** add a README/.gitignore (you have one).
4. Click **Create repository**.
5. GitHub shows a "push an existing repository" box. Copy the two lines and run them, e.g.:

```powershell
git remote add origin https://github.com/YOUR-USERNAME/procurement-auditor.git
git branch -M main
git push -u origin main
```

> Your secrets are safe: `.env` files are git-ignored, so only `.env.example` is uploaded.

---

# Path A — Cloud deployment (recommended)

## A1. Create the database (Supabase)

1. Go to https://supabase.com and click **Start your project** → **Sign in with GitHub**.
2. Click **New project**.
   - **Organization**: pick/create one.
   - **Name**: `procurement-auditor`
   - **Database Password**: click **Generate a password**, then **copy and save it**. You need it in a moment.
   - **Region**: pick the one closest to you.
   - Click **Create new project** and wait ~2 minutes for it to provision.
3. Enable the vector extension:
   - Left sidebar → **Database** → **Extensions**.
   - Search **`vector`** → toggle it **ON** (enable). (Our bootstrap also tries to enable it, but doing it here avoids permission surprises.)
4. Get the connection string (**important — read carefully**):
   - Click **Connect** (top of the page) → the **Connection string** dialog opens.
   - Choose the **Session pooler** tab (NOT "Direct connection").
     > Why: Render's free servers use IPv4, but Supabase's *direct* connection is IPv6-only.
     > The **Session pooler** works over IPv4 and behaves like a normal Postgres connection.
   - Copy the URI. It looks like:
     `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
   - Replace `[YOUR-PASSWORD]` with the database password you saved in step 2.
   - Save this final string — this is your **`DATABASE_URL`**.

## A2. Deploy the backend (Render)

1. Go to https://render.com and click **Get Started** → **GitHub** to sign in.
2. Click **New +** (top right) → **Web Service**.
3. **Connect** your GitHub → find `procurement-auditor` → **Connect**.
   (If you don't see it, click **Configure account** and grant Render access to the repo.)
4. Fill in the settings:
   - **Name**: `procurement-auditor-api`
   - **Region**: closest to you
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime / Language**: `Python 3`
   - **Build Command**:
     ```
     pip install -r requirements.txt && python bootstrap.py && python seed.py && (python seed_memory.py || true)
     ```
   - **Start Command**:
     ```
     uvicorn main:app --host 0.0.0.0 --port $PORT
     ```
   - **Instance Type**: **Free**
5. Scroll to **Environment Variables** → **Add Environment Variable** for each of these:

   | Key | Value |
   |-----|-------|
   | `PYTHON_VERSION` | `3.11.9` |
   | `DATABASE_URL` | *(the Session pooler URI from A1)* |
   | `GROQ_API_KEY` | *(your Groq key)* |
   | `GMAIL_ADDRESS` | *(optional — your Gmail)* |
   | `GMAIL_APP_PASSWORD` | *(optional — 16-char app password)* |

   > Leave `CORS_ORIGINS` out for now — Path A uses a proxy (next step), so CORS isn't needed.
6. Click **Create Web Service**. Render installs deps, seeds the DB, and starts the app.
   Watch the **Logs** tab — you want to see `Application startup complete`.
7. Copy your backend URL from the top of the page, e.g.
   `https://procurement-auditor-api.onrender.com`
8. Test it: open `https://procurement-auditor-api.onrender.com/health` in a browser.
   You should see `{"status":"ok","db":"connected"}`.

> **Free tier note:** the service sleeps after ~15 minutes of inactivity. The next request
> wakes it and takes ~50 seconds. That's normal.

## A3. Point the frontend at your backend

1. In your local project, open [frontend/vercel.json](frontend/vercel.json).
2. Replace `YOUR-BACKEND.onrender.com` with your real Render host (keep `https://` and `/:path*`):
   ```json
   { "source": "/api/:path*", "destination": "https://procurement-auditor-api.onrender.com/:path*" }
   ```
3. Commit and push:
   ```powershell
   git add frontend/vercel.json
   git commit -m "Point frontend proxy at deployed backend"
   git push
   ```

## A4. Deploy the frontend (Vercel)

1. Go to https://vercel.com and click **Sign Up** / **Log In** → **Continue with GitHub**.
2. Click **Add New...** → **Project**.
3. Find `procurement-auditor` → **Import**.
4. Configure:
   - **Root Directory**: click **Edit** → select the **`frontend`** folder → **Continue**.
   - **Framework Preset**: should auto-detect **Vite**. Leave Build/Output as defaults
     (`npm run build`, output `dist`).
   - **Environment Variables**: none needed (the `vercel.json` proxy handles API calls).
5. Click **Deploy** and wait for the build to finish.
6. Click **Visit** to open your live site, e.g. `https://procurement-auditor.vercel.app`.

## A5. Verify end-to-end

1. Open your Vercel URL. The dashboard should load (first load may be slow while the Render
   backend wakes up).
2. Go to **Upload**, drop a PDF invoice, and watch it get processed.
3. Done — your app is live and free. 🎉

*(Optional)* To lock down CORS in case you ever call the backend directly instead of through
the proxy: on Render, add an env var `CORS_ORIGINS` = your Vercel URL (e.g.
`https://procurement-auditor.vercel.app`) and redeploy.

---

# Path B — Docker (fully self-hosted, open source)

Everything runs locally with one command. You only need **Docker Desktop**
(https://www.docker.com/products/docker-desktop/) and a **Groq API key**.

1. In the project root, create a file named `.env` next to `docker-compose.yml`:
   ```
   GROQ_API_KEY=your-groq-key
   # optional:
   GMAIL_ADDRESS=you@gmail.com
   GMAIL_APP_PASSWORD=your-16-char-app-password
   ```
2. Build and start the whole stack:
   ```powershell
   docker compose up --build
   ```
   This starts Postgres+pgvector, runs the DB bootstrap + seed, launches the API, and serves
   the React app behind nginx.
3. Open **http://localhost:8080** in your browser.
4. *(Optional)* Backfill the RAG "decision memory" from the seeded history:
   ```powershell
   docker compose exec backend python seed_memory.py
   ```
5. To stop: press `Ctrl+C`, then `docker compose down` (add `-v` to also delete the database volume).

> To expose this to the internet for free, run a tunnel such as **cloudflared**
> (`cloudflared tunnel --url http://localhost:8080`) — also free and open source.

---

# Local development (no deployment)

**Backend:**
```powershell
cd backend
copy .env.example .env      # then edit .env with your DATABASE_URL + GROQ_API_KEY
pip install -r requirements.txt
python bootstrap.py
python seed.py
python seed_memory.py       # optional
uvicorn main:app --reload
```

**Frontend** (in a second terminal):
```powershell
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. The Vite dev server proxies `/api` to `http://localhost:8000`.

---

# Troubleshooting

| Symptom | Fix |
|--------|-----|
| Backend build/`/health` shows `db: disconnected` | Use the Supabase **Session pooler** string (IPv4), and double-check the password replaced `[YOUR-PASSWORD]`. Special characters in the password are handled automatically. |
| `could not enable pgvector` in logs | Enable the **`vector`** extension in Supabase → Database → Extensions. |
| Build fails on `seed_memory.py` | It's optional; the `|| true` in the build command lets the deploy continue. RAG will just start empty. |
| First page load is very slow / 502 | Render free tier cold start (~50s). Wait and refresh. |
| Frontend loads but API calls 404/blank | Make sure you replaced `YOUR-BACKEND.onrender.com` in `frontend/vercel.json` and pushed, then redeployed on Vercel. |
| CORS error (only if calling backend directly) | Set `CORS_ORIGINS` on Render to your exact Vercel URL and redeploy. |
| Backend runs out of memory on Render free (512 MB) | Heavy embedding can strain the free instance. It degrades gracefully, or upgrade the instance. |
| Uploaded PDFs disappear after a while | Render's free disk is ephemeral; extracted data is safe in Postgres, but raw files reset on restart. |

---

# Free-tier limits (so you're not surprised)

- **Render Free**: 750 instance-hours/month; sleeps after 15 min idle.
- **Supabase Free**: 500 MB database; project pauses after ~1 week of inactivity (click **Resume**).
- **Vercel Free (Hobby)**: generous for static sites; personal/non-commercial use.
- **Groq Free**: rate-limited but plenty for demos.
