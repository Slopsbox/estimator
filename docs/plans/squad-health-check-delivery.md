# Leveranseplan: Squad Helsesjekk

## Premiss

Arbeidet leveres i små, testbare steg. Produksjonsfunksjonen holdes deaktivert
bak et eksplisitt feature flag til e-postleverandør, RLS, cleanup og full
ende-til-ende-test er godkjent.

## Steg 1 – Skill romplattform fra estimeringsdomene

- innfør autoritativ `activity_type`
- bruk expand/contract med default/backfill `estimation`, pointer-versjonering,
  kompatibel frontend og eksplisitt rollback; aktive estimeringssesjoner skal
  ikke avsluttes eller konverteres
- oppdater session-pointer og routing
- trekk Auth, membership, lobby og Presence ut av `SessionProvider`
- flytt estimeringsoperasjoner til `EstimationService/Provider`
- behold eksisterende estimeringsruter som redirects
- bevis med eksisterende tester at Estimat oppfører seg identisk
- produksjonsrekkefølge: deploy kompatibel frontend `d58f3c8`, kjør
  `estimation_activity_type_foundation`, deploy deretter strict frontend
- rollbackrekkefølge: kjør `rollback_activity_type_foundation.sql` før eventuell
  bredere session-integrity rollback

**Commitpunkt:** `refactor: separate room and estimation domains`

## Steg 2 – Fast og versjonert helsesjekkmal

- legg inn katalog med syv områder og 31 stabile question keys
- bruk den foreslåtte katalogen i `docs/product/squad-health-template-v1.md`
- legg til immutable template-versjon
- bygg rene typer og validering
- test rekkefølge, antall, unike nøkler og områdetilknytning

**Commitpunkt:** `feat: add versioned squad health template`

## Steg 3 – Datamodell, RPC og RLS

**Implementeringsstatus 2026-08-26:** Første lokale backend-slice er lagt i
`20260826083155_anonymous_health_check_core.sql` med pgTAP-kontrakter for RPC og
RLS. Runtime SQL og reelle samtidighetsløp gjenstår fordi Docker ikke er
tilgjengelig i implementeringsmiljøet. Se
`docs/plans/health-check-concurrency-tests.md`. Cleanup-funksjonen er med, men
cron/heartbeat/watchdog er bevisst ikke schedulert i denne slicen. Migrasjonen
krever at den separate member-scoped room-RLS-lockdownen allerede er brukt og
feiler ellers før DDL. Preflight verifiserer RLS-flagg, nøyaktig én permissiv
`authenticated` SELECT-policy per `sessions`/`participants` mot en eksakt,
whitespace-normalisert allowlist av medlemsuttrykk, ingen klient-DML-policyer,
ingen anon-grants og bare eksplisitte offentlige SELECT-kolonner for
`authenticated`. Monitoring-schedule har en egen companion-rollback; core-
rollback nekter å fortsette mens wrapper eller heartbeat-tabell finnes. Outboxen
håndhever en lukket statusmaskin, monotone forsøk, immutable identitet/envelope/
provider-ID og write-once snapshot, nonce, PDF og CSV. Rapportworkeren kan lese
katalog, health-sessioner, aggregater og jobber, men aldri respondentkohorten.

- opprett `health_check_sessions`, frosset respondentkohort og aggregater
- implementer create/start/submit/progress/remove/finalize
- implementer `abort_health_check` og gjør generisk leave utilgjengelig etter start
- blokker all direkte rådata- og aggregatlesing
- håndhev ett svar per medlem, alle 31 svar, verdier 1–7, minst fem og alle
  aktive fullført
- legg til 24-timers cleanup
- skriv pgTAP-tester for misbruk og sletting
- test submit/remove/leave/finalize-race under samme room-låserekkefølge

**Commitpunkt:** `feat: add anonymous health check aggregation`

## Steg 4 – Serververifisert inngang

- bind create/join til Turnstile og rate limiting
- valider token, action, hostname, replay og Supabase JWT i samme operasjon
- bruk distribuert rate limit per IP, identitet og kode uten global DoS-lockout
- begrens e-post til `@gjensidige.no`
- test brute force, replay, feil aktivitetstype og cross-room-angrep

**Commitpunkt:** `feat: secure health check room access`

## Steg 5 – Fasilitatorvalg og lobby

- vis Estimering/Helsesjekk etter valg av fasilitatorrolle
- samle squadnavn, måledato og e-post
- gjenbruk eksisterende design og lobbykomponenter
- vis pågår/fullført og faktisk Presence separat
- tillat fjerning av bare ikke-fullførte

**Commitpunkt:** `feat: add health check facilitator lobby`

## Steg 6 – Deltakeropplevelse

- bygg syvstegs-slider med verbal etikett, smiley og eksisterende design tokens
- implementer touched-state, 3–2–1 auto-advance og avbrudd
- legg til tastatur, skjermleser, redusert bevegelse og eksplisitt fallback
- bygg oppsummeringsskjerm og én endelig innsending
- hold utkast kun i minnet

**Commitpunkt:** `feat: add anonymous health check response flow`

## Steg 7 – Rapport og levering

- velg og sikkerhetsgodkjenn e-postleverandør
- velg PDF-renderer etter dependency review
- generer PDF og CSV fra frosne aggregater
- implementer atomisk outbox med unik room/job/idempotency-kontrakt, worker
  lease, kryptert leveringskø og idempotent retry
- slett alle health-check-data etter levering eller utløp
- valider PDF visuelt og maskinelt, og test CSV-kontrakten

**Commitpunkt:** `feat: deliver ephemeral health check reports`

## Steg 8 – Kvalitets- og sikkerhetsport

- full frontendtest, lint, typecheck, build og audit
- pgTAP RPC-/RLS-/retentiontester
- E2E med minst seks nettleserkontekster
- reconnect, refresh, dobbel innsending og fjernet deltaker
- bevis at fasilitator aldri kan lese aggregater underveis
- bevis at database og kø er tom etter levering
- tilgjengelighetsaudit av slider, nedtelling og rapport
- test auto-advance av/på, fokus, `aria-valuetext`, touched-state og tagged PDF
- produksjonssmoke med rollback-plan

## Obligatoriske testscenarier

1. To personer med samme navn får separate medlemskap.
2. Samme Auth-identitet kan ikke sende to ganger.
3. 30 svar eller én verdi utenfor 1–7 avvises atomisk.
4. Nettverksfeil under submit gir idempotent avklaring.
5. Fasilitator kan ikke lese svar eller aggregater før lukking.
6. Fire fullførte gir ingen rapport; fem kan gi rapport bare når alle aktive er
   fullført.
7. Ikke-fullført medlem kan fjernes; fullført medlem kan ikke fjernes.
8. Rapporten inneholder ingen navn, e-post, IDs eller svarfordeling.
9. E-postfeil oppretter bare kryptert jobb, og originaldata slettes.
10. Levering eller 24-timers expiry etterlater ingen health-check-data.
11. Eksisterende estimeringsflyt er uendret.
12. Realtime/RLS tillater aldri medlem-/helsedata på tvers av rooms eller
    activity type.
13. CSV avviser formelinjeksjon og følger versjonert format.
14. Cron/retention-monitorering varsler på gamle sessions og fastlåste jobs.

## Før implementasjon kan starte

- [ ] Arkitekturen og ADR-ene godkjennes.
- [ ] De syv verbale skalaetikettene godkjennes.
- [ ] Det avklares om rapporten viser 1–7-snitt direkte eller en annen verbal
      presentasjon i tillegg.
- [ ] E-postleverandør og credential-eier avklares før steg 7.
- [ ] Personvernforvaltning og DPIA-screening er godkjent før pilot.
- [x] Produkteier har akseptert praktisk anonymitet og n−1-begrensningen.
