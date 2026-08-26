# ADR-002: Aggreger helsesvar uten å lagre individuelle svar

## Status

Proposed

## Date

2026-08-25

## Context

Helsesjekken skal redusere unødvendig eksponering av individuelle svar for
fasilitator, deltakere og eksterne brukere. Appen må samtidig hindre
dobbeltinnsending, vise hvem som er fullført og lage snitt per spørsmål og
område.

Pseudonymiserte råsvar er ikke tilstrekkelig. En kobling mellom participant-ID
og svar kan senere gjenidentifiseres, og løpende aggregater kan avsløre siste
innsending gjennom differanser.

## Decision

Deltakeren holder alle 31 svar lokalt og sender én samlet array. En atomisk RPC:

- validerer medlemskap, fase og alle 31 verdier
- øker kun sum og antall per spørsmål
- registrerer separat at medlemmet er fullført
- lagrer aldri svararray eller respondentkobling til score

Ingen klient, heller ikke fasilitator, får lese aggregater mens sesjonen pågår.
Rapport kan bare lages når alle aktive respondenter har fullført. Minimum er én
respondent; fasilitatoren teller aldri med.

Produktet lover ikke anonymitet. Resultatet er et gruppeaggregat, men med én
respondent er aggregatet identisk med respondentens svar og er direkte
attribuerbart. Også i små grupper kan svar tilskrives enkeltpersoner gjennom
kontekst eller koordinert n−1-samarbeid. Den tidligere planlagte grensen på fem
reduserte ikke denne risikoen tilstrekkelig til å begrunne et anonymitetsløfte.
Produkteier har valgt minimum én og presise spørsmåls- og områdesnitt fremfor
statistisk støy eller en høyere terskel, og aksepterer attribusjonsrisikoen
eksplisitt.

## Alternatives Considered

### Lagre råsvar med participant-ID og skjule dem i UI

Avvist. UI er ikke en sikkerhetsgrense.

### Lagre råsvar med tilfeldig pseudonym

Avvist. Timing, medlemskap og metadata kan fortsatt koble svar til person.

### Sende svar per spørsmål

Avvist. Gir mer sensitiv mellomlagring og gjør differanse-/timingangrep enklere.

## Consequences

- Fullført svar kan ikke endres eller trekkes ut igjen.
- Fasilitator kan bare fjerne ikke-fullførte medlemmer.
- Utkast går tapt ved refresh i første versjon.
- Vi kan ikke tilby svarfordeling, spredning eller fritekst uten ny
  personvernsvurdering.
- Produkttekst og rapport må kalle resultatet et gruppeaggregat, forklare at én
  respondent betyr at resultatet er identisk med respondentens svar, og advare
  om attribusjonsrisiko i små grupper. De må aldri love anonymitet.
- Databasetester må bevise at ingen råsvartabell eller SELECT-vei finnes.
