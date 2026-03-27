# Edge Functions Setup

## 1. Install Supabase CLI

** Using Scoop in Windows:**
```powershell
# Install Scoop
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression

# Install Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

Then link your project:
```bash
supabase login
supabase link --project-ref hqbspprcvkoopufningr
```

## 2. Create Upstash Redis database
1. Go to https://console.upstash.com
2. Create a new Redis database (free tier)
3. Copy the **REST URL** and **REST Token** from the database details page

## 3. Set secrets
```bash
supabase secrets set UPSTASH_REDIS_REST_URL=https://your-url.upstash.io
supabase secrets set UPSTASH_REDIS_REST_TOKEN=your-token
```

## 4. Deploy functions
```bash
supabase functions deploy curriculum
supabase functions deploy invalidate-cache
```

## 5. Allow public access to curriculum function
In Supabase dashboard → Edge Functions → `curriculum` → disable JWT verification
(the invalidate-cache function keeps JWT verification ON)
