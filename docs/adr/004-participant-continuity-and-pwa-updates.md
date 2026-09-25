# ADR-004: Deltaker-kontinuitet og kontrollerte PWA-oppdateringer

## Status

Accepted

## Date

2026-09-25

## Context

Estimat brukes både som installert PWA og i vanlige nettleserfaner. En mobil kan
suspendere nettverk og JavaScript lenge, flere faner deler anonym Supabase-
identitet, og en service-worker kan oppdateres mens en sesjon pågår.

En lokal 24-timersgrense kunne tidligere fjerne et fortsatt gyldig
estimeringsmedlemskap. Databasen tillot også flere samtidige rom for samme
identitet, mens klienten bare kunne huske ett. Umiddelbar service-worker-
aktivering kunne blande gammel sidekode med nye chunks.

## Decision

- Én anonym nettleseridentitet kan ha ett aktivt rom totalt, uavhengig av rolle
  og aktivitet.
- Bytte til et annet rom krever eksplisitt bekreftelse og utføres atomisk i en
  RPC. Samtidige overgangs-RPC-er serialiseres i et kort, felles advisory-lock-
  vindu før session-rader låses.
- Den lokale rompekeren er bare en gjenopprettingsnøkkel. Den slettes først når
  serveren autoritativt avviser medlemskapet.
- Faner synkroniserer pekerendringer. En fane som får nytt rom, forkaster gammel
  autoritativ state før den gjenoppretter den nye.
- Frakoblet tilstand viser sist kjente data, men nye stemmer og irreversible
  handlinger venter på en fersk autoritativ avstemming.
- Uferdige helsesjekksvar lagres lokalt, scoped til rom og deltaker. De utløper
  senest samtidig med serverrommet og slettes ved innsending eller avslutning.
- Ny service-worker aktiveres først etter brukerens valg. Alle førsteparts
  hash-chunks precaches slik at et allerede lastet grensesnitt kan rendres
  frakoblet; API-mutasjoner køes ikke.
- Chunk-feil får maksimalt én automatisk reload per build og feilnøkkel.

## Alternatives Considered

### Flere aktive rom per nettleser

Avvist. Det krever rom-ID i alle aktive URL-er og en samling lokale medlemskap.
Produktet prioriterer en enkel, eksplisitt rombytteflyt.

### Offline-kø for stemmer

Avvist. En stemme kan være utdatert etter reveal eller ny runde. Autoritativ
servertilstand prioriteres fremfor optimistisk synkronisering.

### Umiddelbar PWA-oppdatering

Avvist. En tvungen oppdatering midt i en lang diskusjon kan miste UI-state og
skape blandede appversjoner.

## Consequences

- Et bekreftet fasilitatorbytte avslutter eller avbryter det gamle rommet.
- Historiske stemmer og rundedeltakelse beholdes når en deltaker forlater eller
  fjernes; fjernede medlemskap kan ikke aktiveres igjen.
- Kontinuitet på tvers av enheter eller slettet nettleserdata er ikke løst.
- PWA-en kan vise cached UI uten nett, men funksjonelle handlinger krever nett.
- Migrasjonen må runtime-testes mot lokal Supabase før produksjonsbruk.
