# Finanzas del hogar (web)

Web version of the finanzas-hogar app, for the owner only. It uses the same
Supabase project as the phone app and signs in with the same email and
password.

## Run locally

Create `.env.local` with the Supabase project URL and anon key:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Then:

```
npm install
npm run dev
npm test
```

## Publish

Every push to `main` runs `.github/workflows/publicar.yml`, which tests,
builds and publishes to GitHub Pages. The workflow reads
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the repository
variables. The anon key is public by design; the data is protected by row
level security on the household.
