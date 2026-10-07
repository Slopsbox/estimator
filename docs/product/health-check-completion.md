# Helsesjekk: fremoverrettet svarflyt og bålpause

Godkjent produktretning 2026-10-01.

- «Neste» låser spørsmålet i klientflyten. Ingen «Forrige», gjennomgang eller
  redigeringsside. Valget kan justeres inntil «Neste» trykkes.
- Siste spørsmål har «Send svar». Hele svarsettet sendes fortsatt i én eksisterende
  servertransaksjon; ingen nye backendkontrakter eller produksjonsmigreringer.
- Under innsending og ved feil er svarene låst. Retry sender samme svarsett;
  ingen offline-kø eller automatisk innsending ved reload.
- Utkast v2 bevarer spørsmålsposisjon og låst innsending. V1 migreres uten
  forlengelse av TTL: første ubesvarte spørsmål, eller låst innsending når komplett.
- Bål vises først etter autoritativ `completed` fra innsending eller tilstandslesing.
  Senere nettverksfeil/eldre polling må ikke åpne spørsmålsflyten igjen.
- Avslutning: «Svarene dine er registrert.» og «Ta en pause mens resten av squaden
  gjør seg ferdig.» Ved kjent romavslutning endres underteksten, ikke kvitteringen.
- «Avslutt» rydder lokal sesjon og går til forsiden; den avbryter ikke gruppens rom.
- Godkjent motiv er bare bålet, uten Vekteren, ekstra banner eller pauseknapp.
  Canvas kjører kontinuerlig mens siden er synlig og rydder animasjonsløkken ved
  unmount. Ingen eksterne bilder, biblioteker, nettverkskall eller sporing.

## Tilgjengelighetsavveining

Brukeren har eksplisitt valgt kontinuerlig dekorativ animasjon uten pause eller
reduced-motion-stopp. Dette er en kjent tilgjengelighetsbegrensning (WCAG 2.2.2);
løsningen skal ikke beskrives som fullt WCAG-kompatibel. Canvas har tekstalternativ,
og øvrige kontroller har tastaturfokus. Låsing i klienten er UX, ikke en ny
sikkerhetsgrense; serveren håndhever fortsatt autorisasjon og endelig innsending.
