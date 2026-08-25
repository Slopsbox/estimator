# ADR-001: Felles romplattform med separate aktivitetsdomener

## Status

Proposed

## Date

2026-08-25

## Context

Appen skal utvides fra én Planning Poker-flyt til også å støtte Squad
Helsesjekk. Begge trenger kode, lobby, medlemskap, anonym Auth og Presence, men
har forskjellige livssykluser, sensitivitet og datamodeller.

Dagens `SessionProvider`, `sessions`-rad og RPC-er er tett knyttet til runder,
stemmer og reveal. Å legge flere betingelser inn i denne modellen vil gjøre RLS,
typing og vedlikehold mer risikabelt.

## Decision

Etabler en felles room/session-envelope for:

- aktivitetstype og routing
- join-kode
- fasilitator og medlemskap
- status, expiry og Presence

Legg aktivitetsdata i separate domener:

- `estimation_*`
- `health_check_*`

Frontend deles tilsvarende i Auth/Room-infrastruktur og separate Estimation- og
HealthCheck-providere/tjenester.

Migreringen gjøres trinnvis. Et `activity_type` kan først legges til dagens
`sessions`, mens dagens estimeringskolonner flyttes ut senere. Ny
helsesjekktilstand skal aldri lagres i estimeringsfeltene.

## Alternatives Considered

### Kun type-felt på dagens sessions

Avvist som målarkitektur. Det gir meningsløse felt på health-check-rader,
forgrening i alle RPC-er, svakere typeinvariants og større risiko for RLS-feil.

### Helt separate session/member-tabeller

Gir god isolasjon, men dupliserer sikkerhetskritisk join-, restore- og
Presence-logikk og skaper kodekollisjonsproblemer.

## Consequences

- Krever en innledende refaktorering før health-check-UI bygges.
- Felles lobbyfunksjoner kan gjenbrukes uten å dele sensitiv domenelogikk.
- En fremtidig tredje aktivitet kan legges til uten å utvide en monolittisk
  provider.
- RLS- og datatester må verifisere både domeneseparasjon og felles medlemskap.
