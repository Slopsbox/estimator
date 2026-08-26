# ADR-003: Kortlevd rapportpakke for sikker device-download

## Status

Proposed

## Date

2026-08-26

## Context

Fasilitatoren trenger PDF og CSV for videre trendarbeid i et godkjent internt
verktøy. Appen skal ikke lagre historikk, og bare den autentiserte fasilitatoren
som opprettet rommet skal kunne hente resultatet. Nettleseren gir ingen
pålitelig bekreftelse på at en fil faktisk er lagret lokalt.

## Decision

- Rapporten er én ZIP med PDF og CSV. Filnavnet består av sanitert squadnavn og
  måledato.
- `finalize_health_check` fryser målingen og oppretter en idempotent jobb med
  status `awaiting_materialization`. Jobben beholder en privat, stabil binding
  til fasilitatorens `auth.uid()`.
- En privat worker claimer jobben, leser frosne aggregater, rendrer PDF og CSV,
  lager ZIP, krypterer hele pakken med AES-256-GCM og unik 96-bits nonce, og
  kaller en service-only materialiseringsfunksjon. `encrypted_package` lagres som
  `ciphertext || 16-byte authentication tag`; plaintext ZIP er maks 4 MiB, og
  databasefeltet tillater derfor maks 4 MiB + 16 byte.
- Materialiseringsfunksjonen låser jobb og health-session, tar fersk
  `clock_timestamp()` etter hver lås og revaliderer claim, lease og begge utløp
  rett før write. Begge må ha `expires_at > materialized_at`; ellers feiler den med `job_expired` uten pakke
  eller sletting. I samme databasetransaksjon
  persisteres ciphertext, nonce, nøkkelversjon og sanitert filnavn, status settes
  til `ready`, `expires_at` settes til det tidligste av materialiseringstidspunkt
  + 15 minutter og opprinnelig romutløp, kildepekeren nullstilles og live-rom,
  medlemskap og aggregater
  slettes.
- Materialiseringsfeil beholder live-data frem til rommets absolutte utløp på 23
  timer og 55 minutter. En utløpt lease kan frigjøres til `failed` for retry.
- En autentisert status-RPC viser bare eieren status og, når pakken er klar, det
  sikre filnavnet. Den returnerer alltid jobbens eksakte `expires_at`, men aldri
  pakken. Finalize returnerer samme utløp i normal og idempotent jobbretur.
- Binærpakken hentes av Vercel-endpointet `POST /api/health-check-download`
  gjennom en offentlig PostgREST-wrapper som kun `service_role` kan kjøre. Den
  private package-funksjonen beholder owner-/ready-/expiry-kontrollen.
  Endpointet verifiserer Supabase-JWT, matcher bruker-ID mot jobbens
  fasilitatorbinding, krever `ready` og ikke utløpt jobb, dekrypterer kun i minnet
  og svarer med attachment.
- Service-enveloppen inneholder også `aad_room_id`. Worker og endpoint bygger
  AES-GCM AAD som UTF-8 uten avsluttende linjeskift i denne eksakte rekkefølgen:
  `health-check-package-v1`, `job_id=<lowercase UUID>`,
  `aad_room_id=<lowercase UUID>`, `field=encrypted_package`,
  `key_version=<positivt base-10 heltall>`, med ett `\n` mellom hvert felt.
- Finalize kan gjentas av bundet fasilitator etter at materialisering har slettet
  rommet og returnerer eksisterende jobb/status. Outsidere får generisk avslag.
  Abort lager ingen artifact/receipt; retry etter vellykket abort er derfor
  eksternt ikke-idempotent og returnerer samme generiske avslag som ukjent rom.
- Nedlasting kan gjentas frem til utløp. Det finnes ingen delivery-ack fra
  nettleseren. Cleanup sletter ciphertext ved utløp.
- Appen skriver ingen rapport eller pakke til Cache API, IndexedDB,
  localStorage, sessionStorage eller annen appstyrt nettleserlagring. Den kan
  skrive en separat operasjonell delivery receipt under
  `health_check_delivery_receipt_v1`: eksakt `{version: 1, roomId, jobId,
  expiresAt}`. Receipt-en inneholder ingen bruker-, navn-, squad-, filnavn-,
  status- eller resultatdata og er derfor ikke en rapport eller pakke.
- Receipt-en er separat fra session-pointeren. Den overlever refresh,
  pointer-clear og source-sletting, men ignoreres etter serverens `expires_at`.
  Statusoppdatering kan forkorte TTL til ready-vinduet, men aldri forlenge den.
  Lagringen er best-effort og lagringsfeil skal ikke bryte finalize/status. Den er
  bare en peker; serveren forblir autoritativ og owner-bindingen autoriserer
  fortsatt all status og download.
  Filen brukeren eksplisitt laster ned blir liggende på enheten og er
  fasilitatorens ansvar.
- Sletteløftet gjelder live-data og appstyrte pakker. Backup, WAL/PITR, logger og
  den nedlastede filen følger egne dokumenterte styrings- og retensjonsregler.

## Endpoint Contract

Endpointet er implementert uten URL-token som `POST` med
`Authorization`-header og Vercels Web-standard `Request`-signatur uten Node-
helpers. Det skal vurdere CSRF i lys av valgt auth-transport,
aldri logge token, jobb-ID, filnavn eller innhold, og håndheve en eksplisitt
requestgrense på 1 KiB og responsgrense på 4 MiB. Responsen har:

```text
Content-Type: application/zip
Cache-Control: no-store, private
Pragma: no-cache
Content-Disposition: attachment; filename="health-check-report.zip"; filename*=UTF-8''<RFC5987>
X-Content-Type-Options: nosniff
```

## Alternatives Considered

### Lagre aggregater i appen for trend

Avvist. Trend håndteres utenfor appen.

### Generere rapport i nettleseren

Avvist. Det eksponerer sensitive aggregater og gjør sletting og autorisasjon
vanskeligere å håndheve.

### Slette pakken etter første respons

Avvist. Nettleseren gir ingen pålitelig kvittering for at filen ble lagret.

## Consequences

- Rapportjobber trenger applikasjonskryptering og nøkkelrotasjon.
- Support kan ikke hente rapporten etter vinduet på opptil 15 minutter; nær
  hovedutløpet er vinduet kortere.
- ZIP/PDF-renderer og worker er eksplisitt senere arbeid. Endpointet bruker bare
  eksisterende Supabase-klient og Node-krypto; ingen ny runtime-avhengighet.
- Fasilitatoren må lagre og behandle den nedlastede filen i henhold til godkjent
  intern praksis.
- Receipt-lagring gir refresh-recovery uten å utvide rapportens dataflate i
  nettleseren, men route/UI-integrasjon må gjøres i en senere leveranse.
