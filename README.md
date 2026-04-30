# TradeMirror OS

Internal ERP + Contract Mirroring Engine for Chipa Farm LLC.

Upload a Frigorífico Concepción supplier PDF → parse it → review/edit fields →
generate a pixel-perfect mirrored sales contract under your active entity →
manage the full trade lifecycle (financials, milestones, documents, alerts).

---

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

The app runs in **two modes**, selected automatically based on env vars:

| Mode      | Trigger                                              | Backend                                          |
|-----------|------------------------------------------------------|--------------------------------------------------|
| **Demo**  | `.env` not set                                       | localStorage (in-browser, seeded on first run)   |
| **Prod**  | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set   | Supabase (Postgres + Auth + Storage)             |

Demo mode is fully functional offline — useful for screencasts and dev. Prod
mode persists everything to Supabase and uses real email/password auth.

---

## Deploy to Vercel + Supabase

### 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run, in order:
   - `supabase/migrations/0001_init.sql` — tables, enums, RLS policies, auto-provision trigger.
   - `supabase/migrations/0002_seed.sql` — default entity, bank profile, contact, sample client.
3. Go to **Storage** → **New bucket** → name it `trade-documents` (private, **not** public). The migration already added the RLS policies; this bucket name is hard-coded in `src/lib/supabase/client.ts`.
4. Create your first admin user:
   - **Authentication** → **Users** → **Add user** → email + password.
   - Then in **SQL Editor** run:
     ```sql
     update public.users set role = 'super_admin' where email = 'you@example.com';
     ```
   The trigger from `0001_init.sql` auto-creates the `public.users` row when an auth user is created — you only need to upgrade the role.

### 2. Push to Vercel

1. Push the repo to GitHub.
2. In Vercel: **New project** → import the repo → framework auto-detected as Vite.
3. **Environment variables** (Settings → Environment Variables):
   - `VITE_SUPABASE_URL` → `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` → the **anon public** key
4. Deploy. The included `vercel.json` configures SPA rewrites and asset caching.

That's it — the deployed app authenticates against Supabase, hydrates trades/clients/etc. from the database on load, uploads documents to Storage, and persists everything to Postgres.

---

## Architecture

```
src/
├── lib/
│   ├── pdf/
│   │   ├── extract.ts       — pdfjs-dist text-run extractor + label/value locators
│   │   ├── parser.ts        — supplier PDF → ParsedContract (typed fields)
│   │   └── generator.ts     — pdf-lib mirror engine (auto-coords from extract.ts)
│   ├── storage/
│   │   ├── db.ts            — sync facade; routes to localStorage OR Supabase cache
│   │   └── files.ts         — saveDocumentBlob / loadDocumentBlob (storage or data URL)
│   ├── supabase/
│   │   ├── client.ts        — Supabase client + isSupabaseEnabled() flag
│   │   └── repos.ts         — hydrate / cache / persist helpers
│   ├── auth/session.ts      — Supabase Auth (loginAsync) + demo impersonation
│   ├── finance.ts           — single source of truth for trade math
│   ├── milestones.ts        — T+7 evaluator
│   ├── match.ts             — fuzzy client matcher (smart auto-fill)
│   ├── format.ts            — currency, dates, tons formatters
│   └── seed.ts              — first-run sample data (demo mode only)
├── pages/                   — Login, Dashboard, Trades/*, Clients, Contacts,
│                              Entities, Users, Partner/*
├── components/
│   ├── layout/              — AppShell, PageHeader
│   ├── ui/                  — Card, Field, Modal, Badge, Empty
│   └── trade/               — KPICard, StatusBadge, Timeline, Warnings
├── store/appStore.ts        — Zustand session store
└── types/                   — domain types
supabase/
└── migrations/
    ├── 0001_init.sql        — schema + RLS
    └── 0002_seed.sql        — default entity / bank / contact / client
vercel.json                  — SPA rewrites + asset cache headers
.env.example                 — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY template
```

### How the PDF mirroring works (v2 — auto-extracted coordinates)

The previous version used hardcoded coordinate guesses for the 701-2026 layout. v2 derives every rectangle from the source PDF's actual text positions:

1. **Extract** — `lib/pdf/extract.ts` runs pdfjs-dist on the supplier PDF, gets every text run with `(x, y, width, height, fontSize)`, then groups them into lines by Y-coordinate.
2. **Locate** — for each editable field, a locator finds the rectangle to overlay:
   - Most fields: find the *label* item (e.g. "Exporter"), in the *correct column* (left or right), at the *right occurrence* (1st "Address" = exporter, 2nd = client). The value rect is the bounding box of items immediately following the label on the same line.
   - Products row: find the line whose first item matches the parsed quantity text.
   - Buyer signature: find the "BUYER" label in the footer, then the line directly above it.
3. **Overlay** — `lib/pdf/generator.ts` uses pdf-lib to draw a white rectangle over each located rect (with 1-2pt padding to fully cover the original glyphs), then injects the new value at the **same baseline Y and font size as the original**. Right-aligned cells (numbers) re-align using the original right edge.
4. **Pure-mirror fields** are never located and never touched: Brand, Plant No., Validity, Packing, Temperature, Shipment Date, Origin, Destination, Incoterm, Obs, Halal/claims clauses, QR/SMGeo footer, and the Frigorífico signature block.
5. **Debug mode** — passing `{ debug: true }` draws a translucent red box around every white-out rect with the field name above it. The Editor exposes this via the **Debug** button next to **Preview PDF**.

This means **the mirror is robust to layout drift**: if Frigo nudges a column or changes spacing, every field still snaps to its correct rect because we read the source PDF's own positions.

### Data layer pattern

`lib/storage/db.ts` is the single sync API the whole app uses (`tradesDB.list()`, `tradesDB.update(...)`, etc). It transparently routes to one of:
- **Demo**: localStorage — synchronous read + write.
- **Prod**: Supabase cache (`lib/supabase/repos.ts`). Reads come from an in-memory cache hydrated at startup (`hydrateFromSupabase()` in `App.tsx`'s `<BootGate>`); writes update the cache synchronously, then fire off `upsert` / `delete` to Supabase in the background. Errors surface in the console without blocking the UI.

This means **no component code had to change** to support Supabase — the sync API is preserved.

### Auth

`lib/auth/session.ts` exposes:
- `loginAsync(email, password)` — Supabase Auth in prod, localStorage check in demo.
- `restoreSessionAsync()` — reads existing JWT (if any) on app boot.
- `impersonate(userId)` — demo-only role switcher; returns null in prod mode.

The Login page uses `loginAsync` directly so errors and async state propagate. Quick-login tiles only render in demo mode.

### File storage

`lib/storage/files.ts` exposes:
- `saveDocumentBlob(tradeId, type, bytes, fileName)` — uploads to the `trade-documents` bucket in Supabase mode (returns the storage path), or returns a `data:application/pdf;base64,...` URL in demo mode.
- `loadDocumentBlob(storagePath)` — auto-detects which kind of path it is and resolves bytes accordingly.

The `documents.storage_path` column thus holds either a Supabase Storage path or an inline data URL, and downstream code (download buttons, audit ZIP, PDF preview) doesn't care which.

---

## Roles

| Role          | Access                                                       |
|---------------|--------------------------------------------------------------|
| Super Admin   | Everything                                                   |
| Internal Team | Trades, folder, clients (view-only)                          |
| Partner       | Read-only portfolio + financials (no profit-split shown)     |

In Supabase mode, RLS policies in `0001_init.sql` enforce these at the database level. In demo mode, the UI hides routes per role.

---

## Email automation (Resend via Supabase Edge Functions)

Two server-side functions live in `supabase/functions/`:

| Function | Trigger | Purpose |
|---|---|---|
| `send-contract` | Browser invoke from the Send modal **or** Auto-email on Generate | Builds a branded HTML email, attaches one or more documents from the bucket, sends via Resend, logs activity, flips the trade to **Active** |
| `check-milestones` | Daily cron (`pg_cron`) | Detects T+7 overdue advance/balance milestones, flips status to `overdue`, emails every active super_admin with a branded alert |

### Deploy the Edge Functions

You'll need the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and to be logged in (`supabase login`).

```bash
# 1. Link the local repo to your Supabase project
supabase link --project-ref <YOUR_PROJECT_REF>

# 2. Set the secrets the functions need
supabase secrets set RESEND_API_KEY=re_...your-resend-key...
supabase secrets set RESEND_FROM='TradeMirror <noreply@chipafarm.com>'
supabase secrets set APP_URL=https://trademirror.chipafarm.com

# 3. Deploy both functions
supabase functions deploy send-contract
supabase functions deploy check-milestones
```

> **Resend setup**: at [resend.com/domains](https://resend.com/domains) verify the domain you'll send from (e.g. `chipafarm.com`). The `RESEND_FROM` value must match a verified sender. Without verification Resend will reject your sends.

### Schedule the daily milestone cron

In Supabase **SQL Editor**, open `supabase/migrations/0003_cron.sql`, replace `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>` with your values, and run it. This enables `pg_cron` + `pg_net` and registers a job that hits `check-milestones` every day at 09:00 UTC.

Verify it's scheduled:
```sql
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 5;
```

### Auto-email on Generate

In the Contract Editor header there's an **Auto-email** checkbox. When ticked, the Generate flow:
1. Builds the mirrored PDF
2. Saves it to Supabase Storage
3. Immediately invokes `send-contract` with the new doc as attachment, the client contact as recipient, and a default professional message
4. Surfaces a green/yellow toast confirming send (or showing why it was skipped)

This is the fastest possible turnaround: one click and the contract lands in the client's inbox.

### Manual send (Send modal)

The **Send to client** button on a trade detail opens a richer modal:
- Multi-recipient TO (comma-separated)
- Optional CC line
- Custom subject + message
- Pick which documents to attach (sales contract, signed contract, BOL — auto-selects the latest sales contract)
- Optional **Schedule for later** (Resend handles delayed delivery)
- Demo mode banner if Supabase is not configured

---

## What's still in scope for Phase 1

- Single supplier (Frigorífico Concepción) — coordinate locators are tuned to that template's labels.
- Web only.
- E-signature is external — signed PDFs are uploaded back into the trade folder.
