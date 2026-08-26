# Estimering – Planning Poker PWA

En enkel Planning Poker-app for teamestimering. Deltakere stemmer på størrelse (XS–XL) og forretningsverdi (Gull/Sølv/Bronse) i sanntid. Fasilitator styrer sesjonen, ser anonymisert fremdrift før reveal og stemmeverdier etter reveal.

## Teknisk stack

- **Frontend:** Vite + React + TypeScript
- **Styling:** Tailwind CSS
- **Backend:** Supabase (Postgres + Realtime)
- **PWA:** vite-plugin-pwa (service worker + manifest)
- **Captcha:** Cloudflare Turnstile
- **Routing:** React Router v7

---

## Kom i gang

### 1. Installer avhengigheter

```bash
npm install
```

### 2. Konfigurer miljøvariabler

```bash
cp .env.example .env.local
```

Fyll inn verdiene i `.env.local`:

| Variabel | Beskrivelse |
|---|---|
| `VITE_SUPABASE_URL` | URL til Supabase-prosjektet |
| `VITE_SUPABASE_ANON_KEY` | Anon/public-nøkkel fra Supabase |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |

For lokal utvikling er Turnstile-testmodus-nøkkelen `1x00000000000000000000AA` forhåndsutfylt – den godkjenner alltid.

---

### 3. Sett opp Supabase lokalt

#### Forutsetninger: [Supabase CLI](https://supabase.com/docs/guides/cli)

```bash
supabase init       # Kun første gang
supabase start      # Starter lokal Supabase-instans
supabase status     # Vis URL og nøkler
```

Kopier `API URL` og `anon key` fra `supabase status` inn i `.env.local`.

#### Kjør migrasjoner og databasetester

```bash
supabase db reset --local
supabase test db --local supabase/tests/session_rpc_test.sql

# Etter at lockdown-filen er brukt i testdatabasen:
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/releases/enforce_session_rls_after_frontend.sql
supabase test db --local supabase/tests/session_rls_test.sql
```

---

### 4. Start utviklingsserver

```bash
npm run dev
```

Åpne [http://localhost:5173](http://localhost:5173)

---

## Tilgjengelige kommandoer

```bash
npm run dev          # Start dev-server
npm run build        # Produksjonsbygg (TypeScript + Vite)
npm run preview      # Forhåndsvis produksjonsbygg
npm run typecheck    # TypeScript-sjekk uten build
npm run test         # Kjør tester
npm run test:watch   # Tester i watch-modus
```

---

## Appflyt

### Landingsside (`/`)
1. Cloudflare Turnstile-widget vises
2. Etter verifisering aktiveres to knapper: **Deltaker** og **Fasilitator**

### Deltaker (`/vote`)
1. Skriv inn navn
2. Kobles automatisk til aktiv sesjon
3. Velg størrelse (XS → XL) og forretningsverdi (🥇🥈🥉)
4. Trykk "Stem" – bekreftelse vises
5. UI resettes automatisk når fasilitator starter ny runde

### Fasilitator (`/dashboard`)
1. Skriv inn navn og trykk "Start sesjon"
   - Eksisterende aktiv sesjon avsluttes automatisk
2. Se deltakere og stemmer i sanntid (to faner)
3. "Ny runde" – inkrementerer rundenummer, resetter deltaker-UI
4. "Avslutt sesjon" – setter status til completed

---

## Koble til Supabase i produksjon

1. Opprett prosjekt på [supabase.com](https://supabase.com)
2. Aktiver **Anonymous Sign-Ins** under Auth. Klienten bruker en anonym, autentisert bruker per nettleseridentitet.
3. Les [`supabase/releases/production_migration_reconciliation.md`](./supabase/releases/production_migration_reconciliation.md) før production `db push`. Historikk skal ikke repareres automatisk.
4. Planlegg ett koordinert maintenance-vindu for den additive `session_identity_and_rounds`-migrasjonen og frontend som bruker RPC-kontrakten. Migrasjonen avslutter alle pågående identity-less legacy-sesjoner og fjerner umiddelbart gamle direkte skriverettigheter/policyer; cached legacy-klienter feiler dermed lukket.
5. Tving oppdatering av cached PWA/service worker i samme vindu før trafikken åpnes igjen. Ikke legg inn en kompatibilitetsperiode med gamle klienter. Lockdown ligger bevisst i [`supabase/releases/enforce_session_rls_after_frontend.sql`](./supabase/releases/enforce_session_rls_after_frontend.sql) og fullfører member-scoped SELECT-RLS og private Presence etter frontend-verifisering.
6. Kjør read-only preflight i [`supabase/releases/production_migration_reconciliation.sql`](./supabase/releases/production_migration_reconciliation.sql). Composite vote-FK forblir `NOT VALID` under additiv cutover og valideres separat med `validate_session_integrity_constraints.sql` etter cleanup/preflight.
7. Gå til **Realtime Settings** og slå av **Allow public access** før lockdown. Presence bruker eksakt privat topic `session:<uuid>` og `realtime.messages`-policyer. Postgres Changes bruker separate private topics og filtreres av tabell-RLS; Supabase dokumenterer ikke en `realtime.messages`-extension-policy for Postgres Changes.
8. Verifiser at `sessions`, `participants`, `votes` og `round_participants` er med i `supabase_realtime`-publikasjonen.
9. Hent **Project URL** og **anon key** fra **Settings → API** og sett dem som miljøvariabler.

### Room activity expand/contract

Room activity-kontrakten må rulles ut i denne rekkefølgen:

1. Deploy kompatibel frontend-commit `d58f3c8`.
2. Kjør migrasjonen `estimation_activity_type_foundation`.
3. Deploy strict frontend som krever `sessions.activity_type`.

Ved rollback kjøres `supabase/releases/rollback_activity_type_foundation.sql`
før en bredere session-integrity rollback. Ikke rull strict frontend tilbake før
databasekontrakten og kompatibel frontend igjen er koordinert.
Etter at rollback-SQL er verifisert, marker historikken eksplisitt med
`supabase migration repair 20260825140936 --status reverted --linked`.

---

## Deploy til Vercel

```bash
# Installer Vercel CLI om nødvendig
npm i -g vercel

# Deploy
vercel --prod
```

Sett environment-variablene i Vercel Dashboard under **Settings → Environment Variables**.

---

## Arkitektur

Se [docs/adr/001-arkitektur-estimeringsapp.md](./docs/adr/001-arkitektur-estimeringsapp.md) for arkitekturbeslutninger og designvalg.

---

## Sikkerhet og medlemskap

- `participants` er varig medlemskap. `left_at` markerer eksplisitt forlatte medlemskap. Realtime Presence er kun et uautoritativt, kosmetisk online-hint og påvirker aldri tilgang, round roster eller stemmetall.
- `round_participants` er autoritativ roster per runde; korte reconnects endrer ikke roster eller stemmetall.
- Sesjonsmutasjoner går gjennom RPC-er og lockdown-migrasjonen begrenser lesing med RLS.
- Vote `DELETE` Postgres Changes abonneres ikke på og brukes aldri som autoritativ event. Deltakerens `ownVote` kommer fra provideren/RPC, fasilitator bruker anonymiserte statuses før reveal, og full vote-snapshot/INSERT brukes etter reveal.
- `supabase test db` krever en kjørende lokal Supabase-stack og dermed Docker.
- `npm audit --omit=dev` er release-gate og er 0. Full `npm audit` rapporterer per 2026-08-25 16 dev-only funn (1 low, 3 moderate, 11 high, 1 critical) i Vercel/build/test-verktøykjeden, blant annet `@vercel/node`, `postcss`, `esbuild` og transitive parser/glob/archive-pakker. De er ikke med i nettleserens runtime-bundle; planen er kontrollert oppgradering og ny audit av build-input-reachability, ikke breaking `npm audit fix --force`.
- Turnstile-gaten i frontend kan omgås ved direkte API-kall. Databasen begrenser hver auth-identitet til én aktiv fasilitator-sesjon, men join brute-force rate limiting er fortsatt en eksplisitt åpen risiko som må løses før offentlig eksponering.
- Supabase anon-key er eksponert i klienten (standard for Supabase)
- For ekstern bruk: vurder server-side Turnstile-validering via Supabase Edge Function
