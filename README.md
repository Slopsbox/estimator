# Estimering – Planning Poker PWA

En enkel Planning Poker-app for teamestimering. Deltakere stemmer på størrelse (XS–XL) og forretningsverdi (Gull/Sølv/Bronse) i sanntid. Fasilitator styrer sesjonen og ser alle stemmer live.

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

#### Kjør migrasjonen

```bash
supabase db push
# eller manuelt via SQL Editor i Supabase Dashboard:
# copy/paste innholdet i supabase/migrations/001_initial_schema.sql
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
2. Gå til **SQL Editor** og kjør `supabase/migrations/001_initial_schema.sql`
3. Gå til **Database → Replication** og verifiser at `sessions`, `participants` og `votes` er med i `supabase_realtime`-publikasjonen
4. Hent **Project URL** og **anon key** fra **Settings → API**
5. Sett disse i `.env.local` (eller som environment-variabler i Vercel)

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

## Sikkerhet (MVP)

- RLS-policyer er åpne (alle kan lese og skrive) – egnet for intern bruk
- Cloudflare Turnstile hindrer automatiserte bot-angrep
- Supabase anon-key er eksponert i klienten (standard for Supabase)
- For ekstern bruk: vurder server-side Turnstile-validering via Supabase Edge Function
