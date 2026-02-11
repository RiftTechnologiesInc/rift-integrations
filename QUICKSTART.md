# Quick Start Guide

Dead simple step-by-step to get Rift Console running.

---

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] Ngrok installed
- [ ] Backend repo cloned: `rift-integrations`
- [ ] Supabase account created
- [ ] Admin user created in Supabase (email: `repo@riftira.com`, password: `password`)

---

## Step 1: Backend Setup

**Terminal 1** - Navigate to backend and install:
```bash
cd rift-integrations
npm install
```

Start backend:
```bash
npm run api:dev
```
✅ Should see: `API listening on 127.0.0.1:3001`

---

## Step 2: Ngrok Tunnel

**Terminal 2** - Start ngrok:
```bash
ngrok http 3001
```
✅ Copy the ngrok URL (e.g., `https://xyz.ngrok-free.dev`)

**Important:** Make sure this URL matches `SALESFORCE_OAUTH_REDIRECT_URI` in `rift-integrations/.env`

---

## Step 3: Frontend Setup

**Terminal 3** - Navigate to frontend and install:
```bash
cd rift-console
npm install
```

Create `.env.local` (copy from `.env.example`):
```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:3001
```

Start frontend:
```bash
npm run dev
```
✅ Should see: `Ready on http://localhost:3000`

---

## Step 4: Open Browser

Open: **http://localhost:3000**

Login with:
- Email: `admin@riftira.com`
- Password: `password123`

---

## Step 5: Connect Salesforce

1. Click **"Connect Salesforce"** in sidebar
2. Enter tenant ID (e.g., `my-firm` or `rift-demo`)
3. Click **"Connect Salesforce"**
4. Login to Salesforce when redirected
5. Approve the connection
6. Wait for redirect back to Rift Console

✅ You should now see your Salesforce data!

---

## Running Environment Summary

You should have **3 terminals running**:

| Terminal | Location | Command | Port |
|----------|----------|---------|------|
| 1 | `rift-integrations` | `npm run api:dev` | 3001 |
| 2 | Any | `ngrok http 3001` | - |
| 3 | `rift-console` | `npm run dev` | 3000 |

---

## Troubleshooting

**"Port 3001 already in use"**
```bash
# Windows
netstat -ano | findstr :3001
taskkill //F //PID <process_id>
```

**"CORS errors in browser"**
- Make sure backend is running on port 3001
- Restart backend if you made code changes

**"No clients showing up"**
- Check OAuth completed (should have redirected after Salesforce login)
- Check backend logs for errors
- Try: `curl http://127.0.0.1:3001/health` (should return `{"ok":true}`)

---

## Quick Reference

**Backend health check:**
```bash
curl http://127.0.0.1:3001/health
```

**List connected tenants:**
```bash
curl http://127.0.0.1:3001/oauth/salesforce/tenants -H "x-api-key: YOUR_API_KEY"
```

**Stop all processes:**
- Press `Ctrl+C` in each terminal (1, 2, 3)

---

That's it! Your Rift Console environment is now running. 🚀
