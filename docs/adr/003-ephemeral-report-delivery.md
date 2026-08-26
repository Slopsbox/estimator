# ADR-003: Kortlevd rapportlevering uten historikk i appen

## Status

Proposed

## Date

2026-08-25

## Context

Fasilitatoren trenger PDF og CSV for videre trendarbeid i et godkjent internt
verktøy. Appen skal ikke lagre historikk. E-postlevering kan feile, og en
feilsendt rapport er sensitiv.

## Decision

- Mottaker må være under `@gjensidige.no`.
- E-post lagres kryptert med en server-only, versjonert nøkkel.
- Finalisering oppretter først en durable outbox-jobb i samme transaksjon som
  aggregatene fryses.
- Rapport genereres i en privat Supabase Edge Function-worker gjennom abstraksjonene
  `ReportRenderer` og `MailDeliveryPort`.
- Ved leverandøraksept slettes hele helsesjekksesjonen og rapportdataene.
- Ved sendefeil krypteres mottaker, PDF og CSV i en privat leveringsjobb.
  Rå aggregater og medlemskap slettes når den krypterte jobben er opprettet.
- Jobben bruker lease, idempotency key og retries. Tilgang utløper etter 23 timer
  og 55 minutter; overvåket cleanup hvert femte minutt gir forventet fysisk
  sletting innen 24 timer.
- Sletteløftet gjelder appens live-data og kø, ikke umiddelbar fysisk sletting
  fra backup/PITR, leverandørlogger eller mottakerens postkasse.
- Ved utløp slettes jobben uten videre historikk.

## Alternatives Considered

### Lagre aggregater i appen for trend

Avvist. Trend håndteres utenfor appen.

### Generere og sende rapport fra nettleseren

Avvist. Det eksponerer leverandørcredential og sensitive rapportdata til
klienten.

### Beholde data til e-postlevering alltid lykkes

Avvist. En leverandørfeil kan da gi ubestemt retensjon.

## Consequences

- E-postleverandør må godkjennes før funksjonen kan ferdigstilles.
- Rapportjobber trenger applikasjonskryptering og nøkkelrotasjon.
- Support kan ikke hente rapporter etter det absolutte tilgangsutløpet.
- Fasilitatoren er ansvarlig for videre lagring i godkjent internt verktøy.
