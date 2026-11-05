# Football Auction

Player auction web app for our football tournament. React (Vite) + TypeScript, Supabase (Postgres, Auth, Realtime), deployed on Vercel.

## Routes

| URL | Who |
| --- | --- |
| `/` | Everyone |
| `/admin/login`, `/admin/settings`, `/admin/teams`, `/admin/players`, `/admin/auction` | Admin |
| `/captain`, `/captain/bid` | Captains (team code) |
| `/live` | TV display |
| `/results` | Everyone |

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev
```

## Database

SQL migrations live in `supabase/migrations/`. Run them in order in the Supabase SQL editor (or with the Supabase CLI: `supabase db push`).

After running them:

1. Authentication → enable **anonymous sign-ins** (for captains).
2. Authentication → Users → create admin user(s), then:
   `insert into profiles (user_id, role) values ('<user uuid>', 'admin');`
3. Storage → create a public bucket named `photos`.
