# BOOST MASTERY

A personal tracker for goals, tasks, habits, and progress records.

## Supabase setup

1. Create a Supabase project.
2. Open the Supabase SQL editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` and fill in:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The app uses the service role key only in server-side Route Handlers. Do not expose it in client components or commit `.env.local`.

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.
