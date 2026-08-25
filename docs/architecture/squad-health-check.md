# Målarkitektur: Squad Helsesjekk

## Status

Foreslått arkitektur, 2026-08-25. Dokumentet skal godkjennes før implementasjon.

## Formål

Squad Helsesjekk er en praktisk anonym temperaturmåling som skal hjelpe en squad med å
oppdage forbedringsområder. Den skal ikke brukes til individuell vurdering,
prestasjonsevaluering eller historikk i appen.

Første versjon bruker en fast, versjonert katalog med 31 spørsmål fordelt på
syv områder. Deltakeren svarer på en skjult, diskret syvpunktskala. Etter
avsluttet sesjon mottar fasilitatoren en PDF og en CSV med anonymiserte
aggregater. Appen beholder ingen trendhistorikk.

«Praktisk anonym» betyr at appen aldri lagrer eller viser individuelle svar og
at en fasilitator, deltaker eller ekstern bruker ikke kan hente dem gjennom
normal bruk eller API-et. Løsningen lover ikke vern mot organisert samarbeid
mellom nesten alle respondentene: fire av fem deltakere som kjenner sine egne
svar kan matematisk utlede den femtes verdi fra et eksakt snitt. Denne
begrensningen er en eksplisitt produktrisikoaksept.

## Besluttede produktregler

- Fasilitator velger Estimering eller Squad Helsesjekk etter rollevalg.
- Helsesjekken bruker samme kode-, lobby-, medlems- og Presence-konsept som
  estimering.
- Fasilitator ser navn og kun statusen `pågår` eller `fullført`; aldri svar,
  spørsmålsnummer eller prosent.
- Minst fem deltakere må ha fullført før rapport kan genereres.
- Alle aktive, påmeldte deltakere må ha fullført. Fasilitator kan fjerne en
  ikke-fullført deltaker før eller under sjekken.
- Respondentkohorten fryses ved start: join stenges, og statusen til hvert
  medlem er enten `in_progress` eller `completed`.
- En fullført deltaker kan ikke fjernes, fordi det ikke lagres et individuelt
  svar som kan trekkes ut av aggregatet igjen.
- Fasilitator kan delta via separat fane/profil/enhet som vanlig deltaker.
- Alle 31 spørsmål må besvares.
- Et spørsmål er først besvart når slideren faktisk er berørt.
- Deltakeren kan endre svar på en oppsummeringsskjerm før én endelig innsending.
- Ingen fritekst i første versjon.
- Fasilitator oppgir squadnavn, måledato og en `@gjensidige.no`-adresse.
- Rapporten viser snitt per område og spørsmål samt antall svar. Ingen
  fordeling, spredning, enkeltverdier eller trendberegning.
- PDF og CSV sendes på e-post. Leverandør avklares før rapporttjenesten bygges.
- Etter bekreftet levering slettes e-post, medlemskap, aggregater og øvrige
  helsesjekkdata.
- Uferdige sesjoner og leveringskø slettes senest etter 24 timer.

## Arkitekturprinsipper

### Modulær monolitt fremfor mange mikrotjenester

Appen er liten. Domenene skal ha tydelige kode- og datagrenser, men vi skal ikke
lage en separat deploybar tjeneste per konsept. Første målarkitektur består av:

1. React-PWA på Vercel.
2. Supabase Auth, Postgres og Realtime.
3. Én avgrenset rapport-/leveringstjeneste som Supabase Edge Function.
4. En utskiftbar e-postadapter inne i rapporttjenesten.

### Felles rom, separate domener

Auth, kode, medlemskap, lobby og Presence er felles romfunksjonalitet.
Estimering og Helsesjekk får egne tilstandsmodeller, tabeller, RPC-er og RLS.

```text
Room platform
├── anonym Auth-identitet
├── rom, kode og medlemskap
├── lobby og Presence
├── estimation-domene
│   ├── runder
│   ├── stemmer
│   └── reveal/konsensus
└── health-check-domene
    ├── fast spørsmålsmal
    ├── fullføringsstatus
    ├── anonyme aggregater
    └── rapportlevering og sletting
```

Et `activity_type`-felt brukes bare som discriminator og routingkontrakt. Vi
skal ikke legge helsesjekkfelter inn i dagens estimeringstilstand.

## Foreslått frontendstruktur

```text
src/
├── app/
│   ├── AppRouter.tsx
│   └── providers/
│       ├── AuthProvider.tsx
│       └── RoomMembershipProvider.tsx
├── platform/
│   ├── auth/
│   ├── realtime/
│   ├── storage/
│   └── supabase/
├── shared/
│   └── ui/
├── rooms/
│   ├── domain/
│   ├── services/
│   ├── hooks/
│   └── components/
└── domains/
    ├── estimation/
    │   ├── domain/
    │   ├── services/
    │   ├── providers/
    │   ├── components/
    │   └── pages/
    └── health-check/
        ├── domain/
        │   ├── template.ts
        │   ├── types.ts
        │   └── aggregation.ts
        ├── services/
        ├── providers/
        ├── components/
        └── pages/
```

Eksisterende designvariabler, typografi, layouts, fokusmønstre og komponentstil
er obligatoriske for det nye domenet.

## Ruter

```text
/                              rollevalg
/facilitator                   aktivitetsvalg

/estimation/join
/estimation/vote
/estimation/dashboard

/health-check/join
/health-check/respond
/health-check/review
/health-check/dashboard
/health-check/delivered
```

Eksisterende `/join`, `/vote` og `/dashboard` beholdes først som redirects til
estimeringsrutene. Join-responsen returnerer autoritativ `activity_type`, og
klienten velger riktig domenerute fra denne verdien, aldri fra lokal cache.

## Tjenestegrenser

### AuthService

- etablerer/gjenbruker anonym Supabase-identitet
- oppdaterer Realtime-token
- kjenner ikke rom eller domene

### RoomMembershipService

- oppretter eller joiner et rom gjennom serververifisert inngang
- gjenoppretter medlemskap
- forlater/fjerner medlemskap
- returnerer romtype og rolle
- kjenner ikke svar, stemmer eller aggregater

### RoomPresenceService

- privat session-scoped Presence
- gir kun kosmetisk online/offline-status
- brukes aldri som autorisasjon, svarstatus eller rapportgrunnlag

### EstimationService

- kapsler dagens runde-, stemme-, reveal- og konsensusoperasjoner
- flyttes gradvis ut av dagens monolittiske `SessionProvider`

### HealthCheckSessionService

- oppretter helsesjekk med fast template-versjon
- starter innsamling
- fryser respondentkohorten og stenger join
- henter sikker rosterstatus
- fjerner kun ikke-fullførte deltakere
- aktiverer finaliseringshandlingen når hele den frosne kohorten er fullført og
  antallet er minst fem; sesjonen lukkes aldri automatisk
- tilbyr en egen `abort_health_check` som sletter hele målingen hvis en allerede
  fullført respondent må trekkes; generisk leave kan ikke brukes til dette

### HealthCheckSubmissionService

- validerer nøyaktig 31 heltall i intervallet 1–7
- verifiserer aktivt medlemskap og åpen sesjon
- tillater nøyaktig én endelig innsending per medlem
- oppdaterer aggregater og fullføringsstatus atomisk
- persisterer aldri svararray, svar per spørsmål eller respondentkobling

### ReportGenerationService

- leser kun et frosset, rapportklart aggregat
- lager PDF og CSV i minnet
- inkluderer squadnavn, måledato, template-versjon og antall svar
- returnerer ingen rådata til nettleseren

### MailDeliveryPort

```ts
interface MailDeliveryPort {
  sendHealthCheckReport(input: {
    recipient: string
    subject: string
    pdf: Uint8Array
    csv: Uint8Array
    idempotencyKey: string
  }): Promise<{ providerMessageId: string }>
}
```

Leverandør velges senere. Domenet skal ikke importere en konkret mail-SDK.

### RetentionService

- sletter all helsesjekkdata etter bekreftet e-postlevering
- sletter uferdige sesjoner etter 24 timer
- sletter krypterte leveringsjobber etter 24 timer
- kjøres minst hver time via `pg_cron`

## Datamodell

Fellesrom er målet. I en overgang kan dagens `sessions`/`participants` brukes
som envelope med `activity_type`, mens estimeringsfeltene flyttes senere.

```text
rooms / sessions
├── id
├── activity_type: estimation | health_check
├── join_code
├── status
├── facilitator_user_id
├── create_request_id
├── created_at
└── expires_at

room_members / participants
├── room_id
├── member_id
├── user_id
├── role
├── display_name
└── left_at

health_check_sessions
├── room_id PK/FK
├── delivery_id uuid UNIQUE
├── template_version
├── phase: lobby | collecting | finalizing | delivery_pending
├── squad_name
├── measurement_date
├── encrypted_facilitator_email
├── email_key_version
├── opened_at
└── expires_at

health_check_respondents
├── room_id
├── member_id
├── state: in_progress | completed
└── PRIMARY KEY (room_id, member_id)

health_check_question_aggregates
├── room_id
├── template_version
├── question_key
├── score_sum
└── response_count

health_check_report_jobs
├── id = delivery_id
├── source_room_id uuid UNIQUE
├── encrypted_recipient envelope
├── encrypted_report_snapshot envelope
├── encrypted_pdf envelope nullable
├── encrypted_csv envelope nullable
├── encryption_key_version
├── status
├── attempts
├── next_attempt_at
├── claimed_by nullable
├── lease_expires_at nullable
├── provider_message_id nullable UNIQUE
├── expires_at
└── idempotency_key UNIQUE
```

Databaseinvariants:

- unik `(room_id, question_key)` i aggregater
- unik completion per `(room_id, member_id)`
- `health_check_respondents(room_id, member_id)` har sammensatt FK til det
  felles medlemskapet og beviser at medlemmet tilhører samme rom
- nøyaktig 31 aggregatrader for den frosne template-versjonen
- identisk `response_count` for alle 31 spørsmål før finalisering
- spørsmålrekkefølge og områdetilknytning eies av serverkatalogen
- områdesnitt er gjennomsnittet av alle enkeltspørsmål i området, beregnet fra
  uavrundede summer; avrunding skjer bare i rapportvisningen
- `score_sum >= response_count`, `score_sum <= response_count * 7` og
  `response_count >= 0`
- aggregatradens `(template_version, question_key)` har FK til immutable
  template-katalog, og template-versjonen må være lik sesjonens versjon
- finalisering avviser annet enn nøyaktig 31 aggregatrader med identisk
  `response_count` lik størrelsen på respondentkohorten

Template og spørsmål er ikke persondata og beholdes som immutable,
versjonerte katalogdata.

## Anonym innsending uten råsvar

Klienten holder svarene i minnet frem til endelig innsending. Refresh eller
lukking før innsending betyr at utkastet går tapt; dette er et bevisst
personvernvalg i første versjon.

`submit_health_check(scores int[])` kjører i én databasetransaksjon:

1. Verifiser `auth.uid()`, aktivt medlemskap, riktig aktivitetstype og fase.
2. Verifiser fast template-versjon, nøyaktig 31 svar og hvert svar 1–7.
3. Lås medlemskap/sesjon og avvis tidligere fullføring.
4. Øk `score_sum` og `response_count` per spørsmål med set-basert SQL.
5. Sett respondentens tilstand til fullført uten å koble medlemmet til
   scoreverdier.
6. Returner kun `{ status: "completed" }`.

`submit`, `remove_member`, `abort` og `finalize` låser room-raden først og bruker
samme låserekkefølge. Det hindrer at en samtidig submit/remove-race etterlater
et aggregert svar uten gyldig completion eller omvendt.

Fasilitator får aldri `SELECT` på aggregattabellen. Dermed kan ikke differanser
mellom innsendinger brukes til å rekonstruere svar. Aggregater blir først
tilgjengelige for den privilegerte rapporttjenesten etter at sesjonen er lukket.

## Fasilitatorprogresjon

En sikker progress-RPC returnerer kun:

```ts
type HealthCheckProgress = {
  memberId: string
  displayName: string
  status: 'in_progress' | 'completed'
}
```

Den returnerer ikke tidspunkt, spørsmål, prosent, svar eller aggregater.

Statusendringen er et operasjonelt signal og kan observeres omtrent i tid av
fasilitatoren. Den batches/polles med grov oppdateringsfrekvens og det lagres
ikke et `completed_at` som klienten kan lese. Dette inngår i den aksepterte
praktiske anonymitetsmodellen.

Fjerning er tillatt bare når medlemmet ikke har en completion-rad. Dette gjør
at rapporten alltid kan dokumentere antall svar uten at et allerede aggregert
svar blir hengende utenfor nevneren.

Ved start kopieres de aktive deltakerne til `health_check_respondents` og join
stenges. Denne tabellen er den frosne kohorten og endres bare når fasilitator
fjerner en respondent med `state = in_progress`. Etter start avviser den
generiske `leave_session` alle health-check-rom; domenet har en egen, låst
remove-operasjon. Hvis en fullført respondent må trekkes, må fasilitator avbryte
hele helsesjekken. `abort_health_check` sletter rom, respondenter, aggregater og
e-post uten å generere rapport.

## Slider- og spørsmålskontrakt

- Native range-input med syv faste steg.
- Ingen tall eller tick-labels vises.
- Verbal etikett vises for valgt nivå, eksempelvis fra «Svært uenig» til
  «Svært enig».
- Smiley og farge følger verdien, men tekstetiketten gjør at mening aldri
  formidles bare med farge.
- `aria-valuetext` bruker samme verbale etikett.
- Slideren starter visuelt i midten, men `touched=false`; midten teller ikke som
  svar før brukeren har interagert.
- Pointer release starter en synlig nedtelling `3, 2, 1` med ett sekund per
  trinn. Ny pointer-interaksjon avbryter og nullstiller nedtellingen.
- Tastaturendring starter en ny tresekunders nedtelling etter siste tastetrykk.
- Brukeren kan avbryte nedtellingen og har en eksplisitt Neste-handling som
  tilgjengelig fallback.
- Auto-advance kan slås av for resten av sesjonen. Fokus flyttes til overskrift
  for neste spørsmål og endringen annonseres kort i en `aria-live="polite"`-
  region; hvert nedtellingstrinn annonseres ikke til skjermleser.
- Før interaksjon formidler hjelpetekst og `aria-describedby` at spørsmålet ikke
  er besvart, selv om native range teknisk eksponerer midtverdien.
- `prefers-reduced-motion` respekteres.
- Etter spørsmål 31 vises en oppsummering med spørsmål og verbale svar. Et
  spørsmål kan åpnes og endres før endelig innsending.

## Rapportkontrakt

Rapporten inneholder:

- squadnavn
- måledato
- template-versjon
- antall fullførte deltakere
- snitt per område, avrundet til én desimal
- snitt per spørsmål, avrundet til én desimal
- forklaring av syvpunktskalaen
- tekst om at målingen er praktisk anonym, skal brukes til forbedring og ikke
  prestasjonsvurdering, samt en kort forklaring om at samarbeid mellom nesten
  alle respondentene kan gjøre matematisk inferens mulig

Rapporten inneholder ikke:

- navn eller medlems-ID-er
- e-postadresse i selve rapporten
- svarfordeling eller standardavvik
- fullføringstidspunkt
- forrige måling eller trend
- fritekst

CSV-formatet bruker stabile `area_key`, `question_key` og `template_version`,
slik at fasilitator kan importere rapporten i et godkjent internt trendverktøy.
CSV har egen `report_schema_version`, UTF-8, semikolon som skilletegn, norsk
desimalkomma og RFC 4180-kompatibel quoting. Alle tekstfelt som starter med
`=`, `+`, `-` eller `@` etter Unicode-normalisering og trimming prefikses med
en enkel apostrof (`'`) før vanlig CSV-quoting. Transformasjonen brukes på alle
tekstceller, også katalogtekst. Squadnavn
trimmes, begrenses til 80 tegn og avviser kontrolltegn.

## Levering og sletting

1. Når alle i kohorten er fullført og antallet er minst fem, aktiveres
   fasilitatorens «Avslutt og send rapport»-handling. Ingen automatisk
   finalisering skjer.
2. `finalize_health_check` låser room-raden, verifiserer kohorten på nytt og
   går atomisk fra `collecting` til `delivery_pending`.
3. I samme transaksjon fryses aggregatene og det opprettes nøyaktig én durable,
   idempotent outbox-jobb med status `pending`, `id = delivery_id`, unik
   `source_room_id` og unik idempotency key. Jobben eksisterer før ekstern I/O.
4. En privat, autentisert worker claimer jobben med lease, genererer PDF/CSV,
   krypterer artefaktene og forsøker sending til den validerte
   `@gjensidige.no`-adressen.
5. Leverandøraksept med en unik provider message ID regnes som «sendt»; faktisk
   levering til innboks kan ikke garanteres uten leverandør-webhook. Ukjent
   resultat retries med samme idempotency key.
6. Etter leverandøraksept slettes live-rommet, medlemskap, aggregater,
   kryptert mottaker og rapportartefakter.
7. Ved feil beholdes bare den krypterte outbox-jobben. Den prøves på nytt og
   slettes senest etter 24 timer.

E-postadresse lagres aldri i klartekst i databasen. Krypteringsnøkkelen ligger
kun som versjonert Edge Function-secret og aldri i frontend eller database.
`delivery_id` opprettes sammen med helsesjekken og finnes derfor før e-posten
krypteres. Hver kryptering bruker unik 96-bits nonce og AES-256-GCM. Nonce og
auth tag lagres med ciphertext; AAD binder data til `delivery_id`, felt-type,
room-ID og `encryption_key_version`. Gammel nøkkel beholdes kun til alle jobber med den
versjonen er levert eller utløpt. Manglende nøkkel gjør at jobben feiler lukket
og slettes ved TTL, aldri sendes som klartekst.

## Failsafe-retensjon

En målrettet cleanup er tryggere enn å «flushe hele databasen»:

```text
hver time:
  delete health-check rooms where expires_at < now()
  delete report jobs where expires_at < now()
  delete eksakte FK-orphans og jobs med utløpt lease/TTL
```

Alle FK-er bruker cascade der det er korrekt. Cleanup-funksjonen er
`SECURITY DEFINER`, ligger utenfor eksponert schema og er ikke kjørbar av
klientroller.

Cleanup er en primær kontroll, ikke bare en reserve. Jobben skriver en separat,
ikke-sensitiv heartbeat-rad med jobbnavn, start/slutt og status. En uavhengig
watchdog varsler navngitt systemeier hvis siste vellykkede kjøring er eldre enn
to timer, hvis eldste aktive helsesjekk er over 24 timer, eller hvis en jobb har
utløpt lease. Runbooken dekker manuell cleanup, stoppet cron, nøkkelproblem og
leverandørfeil. Alarmkanal og systemeier må konfigureres før pilot.

## Sikkerhetsmodell

### Data som må beskyttes

- individuelle scoreverdier
- medlemsliste og fullføringsstatus
- fasilitatorens e-post
- aggregert rapport før levering

### Viktige kontroller

- health-check create/join går gjennom server-/Edge Function-gate med
  Turnstile og rate limiting; token, Supabase JWT, forventet Turnstile action,
  hostname og replay-verdi valideres i samme serveroperasjon. Klienten får ikke
  direkte EXECUTE på interne create/join-funksjoner
- firetegnskode kan beholdes bare med rate limit og lockout
- distributed rate limit brukes per IP, auth-identitet og kode. Feil teller
  per angriper/kombinasjon; en global kodelås skal ikke la en angriper stenge et
  legitimt rom
- alle writes er RPC-only og bruker `auth.uid()` eller serververifisert bruker-ID
- ingen klientrolle kan lese aggregater eller report jobs
- minimum fem fullførte håndheves i databasen
- fasilitator kan ikke lese resultater før lukking
- completed-medlemmer kan ikke fjernes
- rapporttjenesten bruker minst mulig privilegium og logger aldri request body,
  e-post, score eller rapportinnhold
- feiltekster er generiske og inneholder ikke database- eller leverandørdetaljer

### Begrensninger

Systemadministrator for Supabase/Edge Function er en betrodd driftsrolle og kan
teknisk observere systemet. Løsningen beskytter mot fasilitator, deltakere,
eksterne brukere og direkte API-angrep, men lover ikke kryptografisk anonymitet
mot plattformeier.

En ondsinnet fasilitator kan forsøke gjentatte små gruppemålinger. Minimum fem,
manglende løpende aggregater og ingen fordeling reduserer risikoen, men kan ikke
eliminere all inferens eller samarbeid mellom angripere.

«Slettet fra appen» omfatter live-tabeller, kø og appstyrte objekter. Det betyr
ikke umiddelbar fysisk fjerning fra Supabase-backup, WAL/PITR,
e-postleverandørens tekniske logger eller mottakerens postkasse. Før lansering
må faktisk backupretensjon, leverandørretensjon, databehandleravtale og
tilgangsstyring dokumenteres. Produktteksten skal ikke love mer enn dette.

Anonyme Supabase Auth-brukere er felles identitet for flere aktiviteter og
slettes derfor ikke sammen med en helsesjekk. En separat Auth-retensjonsjobb kan
slette ubrukte anonyme brukere etter avtalt periode når de ikke eier aktive
medlemskap. Distribuerte rate-limit-/replay-nøkler har kort, eksplisitt TTL og
inneholder ikke svar. Observability-metrics følger godkjent loggretensjon og må
aldri inneholde rom-ID, navn, e-post eller resultater.

Nåværende production-RLS er medlemsskopet. Utvidelsen må bevare denne grensen:
rooms/members kan bare leses av aktive medlemmer, health-check-rader får egne
strengere policies, og alle estimerings-RPC-er skal eksplisitt avvise
`activity_type != 'estimation'`.

Konkrete health-check-privilegier:

- `anon` og `authenticated` får ingen direkte tabelltilgang til
  `health_check_sessions`, `health_check_respondents`, aggregater eller jobs
- deltaker kan bare sende gjennom `submit_health_check`, som returnerer status
- fasilitatorprogresjon kommer bare fra fasilitatorautorisert RPC og returnerer
  navn + grov status fra respondentkohorten
- aggregater og report jobs kan bare leses av rapportworkerens særskilte rolle
- respondenttabellen har sammensatt FK til `(room_id, member_id)`
- alle health-check-RPC-er verifiserer `activity_type = 'health_check'`, og alle
  estimerings-RPC-er verifiserer `activity_type = 'estimation'`

## Observability uten persondata

Tillatte logger/metrics:

- antall opprettede, fullførte, utløpte og leverte sesjoner
- varighet i grove buckets
- leveringsstatus og teknisk feilkode
- antall aktive medlemmer

Forbudt i logger:

- navn, e-post eller Auth-ID
- join-kode
- scorearray, spørsmålssvar eller aggregatverdier
- PDF-/CSV-innhold

## Personvernforvaltning før pilot

Selv uten råsvar behandles navn, Auth-ID, completion-status, e-post og
arbeidsrelaterte vurderinger. Før pilot må produkteier dokumentere og få
godkjent:

- behandlingsformål, behandlingsgrunnlag og behandlingsansvarlig
- informasjon til ansatte og frivillighet/forventninger
- DPIA-screening
- databehandlere, backup-/loggretensjon og tilgangsroller
- at endelig innsending er irreversibel
- den eksplisitte risikoaksepten for n−1-inferens under praktisk anonymitet

## Migreringsstrategi

Utvidelsen følger expand/contract:

1. Legg til `activity_type` med default/backfill `estimation` og nye nullable
   room-kontrakter uten å endre eksisterende frontend.
2. Deploy kompatibel frontend som forstår pointer-versjon 1 og 2, men fortsatt
   oppretter estimering som før.
3. Valider constraints og activity guards i alle estimerings-RPC-er.
4. Deploy health-check-tabeller/RPC/RLS deaktivert bak feature flag.
5. Kjør database-/RLS-/E2E-test og produksjonspreflight.
6. Aktiver health-check-featuret.
7. Flytt estimeringskolonner ut av envelope i en senere, separat contract-
   migrasjon.

Hvert steg har rollback-SQL og behandler aktive estimeringssesjoner eksplisitt;
ingen migration avslutter eller konverterer dem implisitt.

## Åpne beslutninger før rapportimplementasjon

1. Godkjent e-postleverandør og credential-forvaltning.
2. PDF-renderer for Deno Edge Function; anbefalt å evaluere `pdf-lib` mot krav
   til font, norsk tekst, tilgjengelighet og vedlikehold før avhengigheten tas
   inn.
3. Nøyaktige verbale etiketter for de syv nivåene og hvordan snitt 1–7 skal
   presenteres i rapporten.
