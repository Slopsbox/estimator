# Målarkitektur: Squad Helsesjekk

## Status og formål

Foreslått arkitektur, oppdatert 2026-08-26. Squad Helsesjekk er en praktisk
anonym temperaturmåling, ikke et verktøy for individuell vurdering eller
historikk i appen. Første versjon har 31 spørsmål i syv områder. Individuelle
svar persisteres aldri; bare summer og antall oppdateres ved endelig innsending.

Fire av fem personer som kjenner egne svar kan matematisk utlede den femtes
verdi fra et eksakt snitt. Denne n-1-begrensningen er eksplisitt akseptert.

## Produktregler

- Felles romplattform gir Auth-identitet, kode, medlemskap, lobby og Presence.
- Respondentkohorten fryses ved start. Join stenges, og alle aktive må fullføre.
- Minst fem deltakere kreves. En ufullført deltaker kan fjernes; en fullført
  deltaker kan bare håndteres ved å avbryte hele målingen.
- Alle 31 spørsmål må besvares på en berørt syvpunktsskala. Utkast finnes bare i
  React-minne og går tapt ved refresh.
- Fasilitator oppgir navn, squadnavn og måledato.
- Resultatet er én ZIP med PDF og CSV. Filnavnet er
  `<sanitert-squadnavn>-<måledato>.zip`.
- Bare samme autentiserte fasilitator som opprettet rommet kan hente pakken.
- Appen beholder ingen browser-kopi. Eksplisitt nedlastet fil ligger på device og
  er fasilitatorens ansvar.

## Komponenter og grenser

```text
React PWA
├── HealthCheckGateway: serververifisert create/join
├── HealthCheckService: start/submit/progress/remove/finalize/status
└── HealthCheckDownloadGateway: requestDownload(jobId), ingen lokal lagring

Supabase Postgres
├── immutable template-katalog
├── live session, frosset respondentkohort og aggregater
├── owner-bound report job
├── authenticated status-RPC
└── private claim/fail/materialize/package/cleanup-funksjoner

Private report worker
├── leser frosne aggregater før materialisering
├── rendrer PDF og CSV i minnet
├── lager én ZIP og krypterer pakken med AES-256-GCM
└── materialiserer pakke og sletter live-data atomisk

Vercel download endpoint
├── validerer Supabase-JWT og eierbinding
├── henter kryptert pakke gjennom service-only funksjon
├── dekrypterer i minnet
└── returnerer no-store attachment
```

Rapportworker og endpoint er private serverkomponenter. Ingen klientrolle kan
lese aggregater, jobbtabellen eller ciphertext. `service_role` har kun direkte
`SELECT` på nødvendig rapportgrunnlag; jobbmutasjoner går gjennom eksplisitte
`SECURITY DEFINER`-funksjoner med lukket `search_path`.

## Datamodell

```text
health_check_sessions
├── room_id PK/FK ON DELETE CASCADE
├── delivery_id UUID UNIQUE
├── template_version
├── phase: lobby | collecting | download_pending
├── squad_name
├── measurement_date
├── opened_at
└── expires_at <= created + 23h55m

health_check_respondents
├── room_id + member_id PK
└── state: in_progress | completed

health_check_question_aggregates
├── room_id + question_key PK
├── template_version
├── score_sum
└── response_count

health_check_report_jobs
├── id = delivery_id PK
├── source_room_id UUID UNIQUE NULL, FK ON DELETE SET NULL
├── facilitator_user_id UUID NOT NULL FK auth.users
├── aad_room_id UUID NOT NULL
├── encrypted_package BYTEA NULL
├── package_nonce BYTEA(12) NULL
├── encryption_key_version INTEGER NULL
├── sanitized_filename TEXT NULL
├── status: awaiting_materialization | processing | ready | failed
├── attempts, next_attempt_at, claimed_by, lease_expires_at
├── materialized_at NULL
├── expires_at
└── idempotency_key UNIQUE
```

Før materialisering er `expires_at` lik rommets utløp. Materialisering krever at
både jobben og den låste health-sessionen fortsatt lever. En `ready` jobb har
ingen kilde-FK, komplett write-once pakke-enveloppe og utløper ved det tidligste
av `materialized_at + 15 minutter` og det opprinnelige romutløpet. Vinduet er
derfor opptil 15 minutter og kan være kortere nær hovedutløpet. `ready` er
terminal og hele raden er uforanderlig, bortsett fra eksakte no-op updates.
`failed` og `awaiting_materialization` beholder live-rommet frem til hovedutløpet.

## Pipeline og transaksjoner

1. `finalize_health_check` låser rommet, verifiserer minst fem fullførte, 31
   aggregater og identisk respondentantall, setter `download_pending` og lager
   nøyaktig én owner-bound jobb i `awaiting_materialization`.
2. Worker claimer jobben med kort lease gjennom privat RPC. Forsøk er monotone.
3. Worker leser metadata/katalog/aggregater, genererer PDF og CSV, ZIP-er dem og
   krypterer hele pakken. `encrypted_package` er ciphertext etterfulgt av en
   16-byte GCM-tag. Plaintext ZIP er maks 4 MiB. AAD er UTF-8 uten avsluttende
   linjeskift i eksakt format:

   ```text
   health-check-package-v1
   job_id=<lowercase UUID>
   aad_room_id=<lowercase UUID>
   field=encrypted_package
   key_version=<positivt base-10 heltall>
   ```

   Både worker og endpoint bygger denne strengen fra jobb-ID, returnert
   `aad_room_id`, felttypen `encrypted_package` og `encryption_key_version`.
4. `materialize_health_check_download` låser jobben, tar fersk wall-clock-tid,
   låser source health-sessionen og tar ny `clock_timestamp()`. Rett før write
   revalideres claim, lease og begge utløp mot enda en fersk tid. Funksjonen
   validerer pakkeparametre, persisterer pakken, setter `ready` med opptil 15 minutters utløp,
   nullstiller kildepekeren og sletter `sessions`-raden. Cascades sletter health
   session, respondentkohort, aggregater og medlemskap i samme transaksjon.
5. Status-RPC krever `auth.uid() = facilitator_user_id`. Den viser aldri pakken.
6. Download-endpointet bruker JWT-identiteten som `p_user_id`; service-only
   package-funksjon returnerer bare `ready`, eierbundet og ikke utløpt pakke,
   inkludert `aad_room_id` sammen med ciphertext, nonce, nøkkelversjon og filnavn.
7. Cleanup sletter utløpte jobber, frigjør stale processing-leaser som `failed`
   når rommet fortsatt lever, og sletter utløpte live-rom.

## Rapportkontrakt

PDF og CSV inneholder squadnavn, måledato, template-versjon, antall fullførte,
snitt per område og spørsmål samt forklaring av skala og praktisk anonymitet.
De inneholder ikke navn, medlems-ID-er, enkeltverdier, fordeling,
fullføringstidspunkt, trend eller fritekst.

CSV bruker stabile area/question keys, `report_schema_version`, UTF-8, semikolon,
norsk desimalkomma og RFC 4180-quoting. Tekst som etter normalisering og trimming
starter med `=`, `+`, `-` eller `@`, prefikses med apostrof før quoting.

## Download- og browserkontrakt

Endpointet er `POST /api/health-check-download` med Supabase-JWT i header,
Vercels Web-standard `Request` uten helper-preparsing, ingen URL-token, 1 KiB
rå requestgrense og 4 MiB responsgrense. Hvis auth senere
flyttes til cookies, kreves separat CSRF-kontroll. Det skal ikke logge request
body, token, jobb-ID, filnavn eller rapportinnhold.

Responsen bruker `application/zip`, `Cache-Control: no-store, private`,
`Pragma: no-cache`, `X-Content-Type-Options: nosniff` og `Content-Disposition`
med sanitert ASCII fallback og RFC 5987 `filename*`. Dekryptering skjer kun i
serverminne. Gjentatt nedlasting er tillatt i et vindu på opptil 15 minutter
fordi browseren ikke gir pålitelig lagringskvittering.

Etter atomisk romsletting er `finalize_health_check(room_id)` idempotent for den
bundne fasilitatoren og returnerer eksisterende jobb/status. Andre brukere får
samme generiske `facilitator_required` som for et ukjent rom. `abort_health_check`
har ingen varig artifact eller privat receipt; retry etter vellykket sletting er
derfor eksternt ikke-idempotent og returnerer generisk `facilitator_required`.

Frontend-adapteren utløser nedlasting uten å skrive Blob/pakke til Cache API,
IndexedDB, localStorage eller sessionStorage. Nettleserens ordinære,
brukerinitierte filnedlasting er utenfor appens lagring og blir liggende på
enheten.

## Sikkerhet og personvern

- Create/join skal gå gjennom servergate med JWT, Turnstile og distribuert rate
  limiting. Firetegnskode er aldri autorisasjon alene.
- Alle domeneoperasjoner verifiserer aktivitetstype og medlemskap/eierbinding.
- Ingen klientrolle har direkte tabelltilgang til health-data eller report jobs.
- Worker logger aldri navn, auth-ID, kode, score, aggregater eller rapportinnhold.
- Feil er generiske. Nøkkelmateriale finnes bare i server-secret og roteres per
  versjon; manglende nøkkel feiler lukket.
- Live-data er utilgjengelig etter `expires_at` selv før fysisk cleanup.
- Backup/WAL/PITR, tekniske logger og den nedlastede filen har egne
  tilgangs-, retensjons- og slettingsregler. DPIA-screening, behandlingsgrunnlag,
  frivillighet, systemeier, alarmkanal og backupforvaltning må godkjennes før
  pilot.

Tillatte metrics er aggregerte antall, grove varighetsbuckets, teknisk status og
stale lease/cleanup-alder. Identifikatorer, squadnavn, kode, resultat og filnavn
er forbudt i logger og metrics.

## Åpne implementasjonsvalg

1. ZIP- og PDF-bibliotek etter dependency-, font-, tilgjengelighets- og
   vedlikeholdsvurdering.
2. Rapportworker-runtime, scheduler, retry/backoff og nøkkelrotasjonsrunbook.
3. Endelige verbale etiketter og presentasjon av 1-7-snitt i rapporten.
