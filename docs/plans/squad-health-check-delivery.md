# Leveranseplan: Squad Helsesjekk

## Premiss

Arbeidet leveres lokalt i testbare steg og holdes deaktivert til RLS, cleanup,
worker, download-endpoint og ende-til-ende-test er godkjent. Ingen rapport eller
pakke lagres av appen i browseren. En separat, kortlevd delivery receipt med bare
rom-ID, jobb-ID og serverutløp er tillatt. Den eksplisitt nedlastede ZIP-en på
device er fasilitatorens ansvar.

## Leverte foundations

1. Felles romplattform har autoritativ `activity_type`, medlems-RLS og separate
   health-RPC-er.
2. Immutable v1-katalog har syv områder og 31 spørsmål.
3. Live-modellen har frosset respondentkohort, kun aggregater, minimum én
   respondent ekskludert fasilitator, komplett submit og 23t55m
   failsafe-retensjon. Den tidligere planlagte femgrensen er erstattet av denne
   produktbeslutningen.
4. Rapportjobben er refaktorert til owner-bound device-download:
   `awaiting_materialization | processing | ready | failed`, nullable
   `source_room_id`, write-once AES-GCM-pakke og opptil 15 minutter retry etter
   materialisering, aldri forbi opprinnelig romutløp.
5. Private claim/fail/materialize/package-funksjoner og en offentlig eksponert,
   service-only, claim-/lease-bundet snapshot-RPC håndhever minst privilegium.
   Worker har ingen direkte `SELECT` på rapportgrunnlaget. Materialisering og
   sletting av live-data skjer atomisk. Snapshot-RPC-en revaliderer fersk tid tre
   ganger etter initial jobbsjekk: etter source-lås, etter session-lås og etter
   katalog-/aggregatvalidering umiddelbart før returspørringen. Hver revalidering
   sjekker claim/lease før jobb- og source-utløp; session-invariantene sjekkes
   etter den andre.
6. Frontendkontrakten har statuspolling, `HealthCheckDownloadGateway` og klar
   nedlastingsknapp uten transport- eller browserlagringsimplementasjon.
7. Delivery receipt-foundation har egen localStorage-nøkkel og eksakt
   `{version: 1, roomId, jobId, expiresAt}`. Den er ikke koblet til route/UI,
   overlever session-pointer/source-sletting og fjernes ved utløp.
8. En ekte terminal prototype-RPC, `finalize_health_check_prototype`, returnerer
   den ferdige aggregate-only JSON-rapporten og sletter hele live-rommet atomisk
   uten jobb eller serverpersistens. Dette er en one-shot prototype: mistet
   respons etter commit kan ikke gjenopprettes, automatisk retry er ikke trygt,
   og UI-advarsel/gating gjenstår. Den fulle worker-/download-stien over er
   fortsatt fremtidig produksjonssti.
9. Lokal prototypeinngang er autentisert direkte i databasen:
   `create_health_check_room_prototype` utleder fasilitator fra `auth.uid()`, og
   felles `join_session` serialiserer mot start på den aktive romraden og støtter
   bare ikke utløpte health-lobbyer uten service-join. Ingen endpoint eller UI er
   koblet til. Turnstile er ikke en
   sikkerhetsgrense, distribuert rate limiting mangler, og firetegnskoden har en
   kjent brute-force-risiko. Prototypen skal derfor forbli uutplassert.

## Neste steg

### Serververifisert inngang

- bind create/join til Turnstile, JWT og distribuert rate limiting
- behandle Turnstile som misbruksbrems, aldri som autorisasjon eller annen
  sikkerhetsgrense
- valider action, hostname og replay i samme operasjon
- test brute force, replay, feil aktivitetstype og cross-room-angrep

### Fasilitator- og deltakerflyt

- samle navn, squadnavn og måledato, uten adressefelt
- gjenbruk lobby/Presence, og vis bare pågår/fullført
- integrer slider, touched-state, auto-advance og review
- hold alle utkast kun i React-minne

### Rapportworker

- velg ZIP/PDF-bibliotek etter sikkerhets- og dependency review
- hent kun det validerte, frosne rapportgrunnlaget gjennom service-only
  `get_health_check_report_snapshot_for_service`; ikke les kildetabellene direkte
- generer PDF og CSV, pakk én ZIP og krypter med AES-256-GCM
- bruk eksakt kanonisk AAD fra arkitekturen med jobb-ID, returnert `aad_room_id`,
  felttype `encrypted_package` og nøkkelversjon
- claim via privat RPC; ved komplett pakke kall atomisk materialiserings-RPC
- ikke legg til ZIP/PDF-avhengigheter før denne slicen starter

### Download-endpoint

- Vercel `POST /api/health-check-download` er implementert bak
  `ENABLE_HEALTH_REPORT_DOWNLOAD=true`; default er generisk 404
- endpointet bruker Vercels Web-standard `fetch(Request)`-signatur uten Node-
  helpers; rå JSON-stream leses med hard 1 KiB-grense, avvises tidlig ved for stor
  `Content-Length` og kanselleres ved stream-overløp
- krev Supabase-JWT i header; ingen URL-token eller cookie-auth
- verifiser JWT med `auth.getUser`, og bind den returnerte bruker-ID-en mot
  jobbens `facilitator_user_id` i service-only package-funksjonen
- dekrypter `ciphertext || 16-byte GCM-tag` i minnet, krev ZIP-signatur og
  håndhev 4 MiB i database og endpoint
- returner `application/zip`, `Cache-Control: no-store, private`,
  `Pragma: no-cache`, `X-Content-Type-Options: nosniff` og sanitert RFC 5987
  attachment-filnavn
- logg aldri token, jobb-ID, filnavn, pakke eller resultat
- adapteren skal ikke kobles til UI eller feature-gaten aktiveres før worker,
  SQL-runtime, Vercel preview-smoke, monitoring og E2E er godkjent

### Retensjon og drift

- schedule cleanup hvert femte minutt først etter monitoring-godkjenning
- slett utløpte ready-pakker, utløpte live-rom og jobb/rom ved hovedutløp
- frigjør stale lease til `failed` bare mens live-rommet fortsatt finnes
- heartbeat/watchdog varsler ved siste suksess over 15 minutter, rom over 24
  timer eller utløpt lease
- dokumenter backup/WAL/PITR-, logg- og filforvaltning før pilot

## Obligatoriske testscenarier

1. Samme Auth-identitet kan ikke sende to ganger; malformed arrays er atomiske.
2. Null respondenter avvises; én respondent kan starte, fullføre og gi snapshot.
   Fasilitatoren teller aldri med, og alle i frosset kohort må fullføre.
3. Klientroller kan aldri lese aggregater, jobbtabell eller pakke.
4. Finalisering lager én idempotent `awaiting_materialization`-jobb med korrekt
   fasilitatorbinding og uten pakke.
5. Bare privat worker kan claime, hente claim-/lease-bundet snapshot og
   materialisere; worker har bare direkte kømetadata-tilgang.
6. Ugyldig eller uclaimet materialisering beholder live-data.
7. Vellykket materialisering lager én ikke-tom kryptert ZIP, nullstiller
   source-FK og sletter rom, medlemskap og aggregater i samme transaksjon.
8. Pakken utløper ved `least(materialized_at + 15m, original source expiry)`;
   utløpt jobb eller låst source-session kan ikke materialiseres.
9. Status er owner-only; package-funksjonen avviser feil eier og utløpt pakke og
   returnerer `aad_room_id` bare i service-enveloppen.
10. `ready` og pakkeenveloppen er terminal/write-once; forsøk er monotone.
11. Cleanup sletter utløpte pakker og rom og håndterer stale lease.
12. Frontend viser fire jobbstatuser og avledet `expired`, låser andre mutasjoner,
    forklarer automatisk retry og kaller `onDownload` bare fra `ready`.
13. Ingen health create-input, UI-tekst, skjema eller implementasjon inneholder
    adresse-/leverandørfelter.
14. Endpointtest verifiserer auth/eier, headers, størrelse, ingen URL-token,
    gjentatt nedlasting innen vinduet og ingen browser-cache.
15. PDF/CSV valideres visuelt og maskinelt; CSV-formelinjeksjon avverges.
16. Eksisterende estimeringsflyt og rollback er uendret og grønn.
17. Finalize-retry etter romsletting returnerer samme owner-jobb; outsider avvises.
18. Abort-retry etter sletting returnerer dokumentert generisk unavailable-feil.
19. Health restore i `download_pending` returnerer `ok` og health-snapshot frem
    til materialisering; etter source-sletting returnerer den
    `membership_missing`. Ferdig estimation beholder `session_completed`.
20. Finalize og owner-only status returnerer eksakt jobb-utløp; receipt-parseren
    avviser ekstra felt, ugyldig UUID/tid, mismatch og utløpt metadata.
21. Prototype-finalize avviser null/ufullført/malformed kohort, returnerer eksakt
    `health-check-prototype-v1` med 7/31 sorterte ett-desimals aggregater, ingen
    identitetsfelt og ingen jobb, og sletter hele romgrafen atomisk. Retry gir
    generisk `facilitator_required`.

## Kvalitetsport

- frontend: test, lint, typecheck og build
- database: lokal reset, alle pgTAP-planer og rollback dry-run
- statisk søk etter fjernede health-felter og gamle jobbstatuser
- seks browserkontekster for kritisk flyt, inkludert reconnect og refresh
- tilgjengelighetsaudit av slider, status og nedlastingshandling
- dependency audit før renderer/ZIP legges til
- produksjonssmoke og dokumentert rollback før feature flag aktiveres

## Før pilot

- [ ] Arkitektur og ADR-003 godkjent.
- [ ] Verbale skalaetiketter og rapportpresentasjon godkjent.
- [ ] ZIP/PDF-avhengigheter sikkerhetsgodkjent.
- [ ] Endpoint-runtime, minne-/størrelsesgrenser og JWT-validering godkjent.
- [ ] Personvernforvaltning, DPIA-screening, backupretensjon og filansvar godkjent.
- [ ] Cleanup-monitorering, systemeier og alarmkanal konfigurert.
- [x] Minimum én respondent og direkte attribusjonsrisiko er akseptert. Resultat
  med én respondent er identisk med respondentens svar, små grupper kan være
  attribuerbare, og produktet lover aldri anonymitet.
