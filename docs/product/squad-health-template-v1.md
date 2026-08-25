# Squad Helsesjekk – spørsmålsmal v1

## Status

Foreslått fast mal. Tekst, nøkler, rekkefølge og områdetilknytning er immutable
etter første produksjonsmåling. Endringer krever en ny template-versjon.

## Svarskala

Internt lagres ett heltall fra 1 til 7. Tall vises ikke i deltakergrensesnittet.
Foreslåtte verbale etiketter må godkjennes før implementasjon:

| Verdi | Verbal etikett |
|---:|---|
| 1 | Svært uenig |
| 2 | Uenig |
| 3 | Litt uenig |
| 4 | Nøytral |
| 5 | Litt enig |
| 6 | Enig |
| 7 | Svært enig |

## Områder og spørsmål

### 1. Arbeidsglede og energi

**Nøkkel:** `joy_energy`

**Introduksjon:** Er det fortsatt gøy å gå på jobb?

**Hva området måler:** Arbeidsglede, motivasjon, energi og om arbeidshverdagen
oppleves bærekraftig.

| Nr. | Spørsmålsnøkkel | Påstand |
|---:|---|---|
| 1 | `joy_look_forward` | Jeg gleder meg som regel til arbeidsdagen. |
| 2 | `joy_energy_balance` | Oppgavene mine gir meg mer energi enn de tapper meg for. |
| 3 | `joy_fun_together` | Vi har det gøy sammen, også når handlekurven velter. |
| 4 | `joy_challenge_mastery` | Jeg opplever at det er en god balanse mellom utfordringer og mestring. |

### 2. Menneskene og tryggheten

**Nøkkel:** `people_safety`

**Introduksjon:** Kan vi være mennesker, ikke bare ressurser?

**Hva området måler:** Psykologisk trygghet, omsorg, hjelpekultur og
bærekraftig arbeidsbelastning.

| Nr. | Spørsmålsnøkkel | Påstand |
|---:|---|---|
| 5 | `safety_speak_up` | Jeg føler meg trygg på å si hva jeg mener i teamet. |
| 6 | `safety_learn_from_mistakes` | Det er greit å gjøre feil, så lenge vi lærer og rydder opp etter oss. |
| 7 | `safety_people_care` | Jeg opplever at menneskene rundt meg bryr seg om hvordan jeg har det. |
| 8 | `safety_ask_for_help` | Jeg kan be om hjelp før varsellampene begynner å blinke. |
| 9 | `safety_sustainable_pace` | Arbeidshverdagen min har et tempo jeg kan stå i over tid. |

### 3. Oppgaver, retning og mening

**Nøkkel:** `direction_meaning`

**Introduksjon:** Vet vi hvor vi skal, og hvorfor kunden bør bry seg?

**Hva området måler:** Formål, kundeverdi, inspirasjon, fokus og teamets
mulighet til å påvirke.

| Nr. | Spørsmålsnøkkel | Påstand |
|---:|---|---|
| 10 | `direction_understand_outcome` | Jeg forstår hva teamet prøver å oppnå, ikke bare hva vi skal levere. |
| 11 | `direction_meaningful_work` | Oppgavene jeg jobber med oppleves meningsfulle og inspirerende. |
| 12 | `direction_customer_value` | Vi ser en tydelig sammenheng mellom arbeidet vårt og verdi for kunder, rådgivere eller Gjensidige. |
| 13 | `direction_clear_priorities` | Vi har tydelige prioriteringer og slipper å forsikre alt mot alt samtidig. |
| 14 | `direction_autonomy` | Vi får påvirke hvordan vi løser oppgavene, ikke bare ekspedere bestillingen. |

### 4. Kvalitet og teknisk helse

**Nøkkel:** `quality_technical_health`

**Introduksjon:** Er løsningen i god teknisk form, eller holdes den sammen med
gaffateip?

**Hva området måler:** Opplevd kvalitet, teknisk gjeld, leveransetrygghet og
læring etter feil.

| Nr. | Spørsmålsnøkkel | Påstand |
|---:|---|---|
| 15 | `quality_proud_to_ship` | Vi leverer løsninger vi er stolte av å sende ut til kundene. |
| 16 | `quality_time_to_do_well` | Vi har nok tid og rom til å gjøre jobben skikkelig. |
| 17 | `quality_debt_managed` | Teknisk gjeld og andre kvalitetsproblemer blir håndtert før de blir en dyr egenandel. |
| 18 | `quality_safe_changes` | Det føles trygt og forutsigbart å gjøre endringer og produksjonssette. |
| 19 | `quality_learn_without_blame` | Vi oppdager og lærer av feil uten å lete etter noen å skylde på. |

### 5. Samarbeid i squaden

**Nøkkel:** `squad_collaboration`

**Introduksjon:** Spiller fagområdene på samme lag?

**Hva området måler:** Tverrfaglighet, involvering, likeverdig påvirkning og
kunnskapsdeling.

| Nr. | Spørsmålsnøkkel | Påstand |
|---:|---|---|
| 20 | `squad_involved_early` | Utvikling, design og analyse blir involvert tidlig nok i arbeidet. |
| 21 | `squad_equal_influence` | Alle fagområdene blir lyttet til og har reell påvirkning på løsningene. |
| 22 | `squad_share_and_help` | Vi deler kunnskap godt og hjelper hverandre når noen står fast. |
| 23 | `squad_one_team` | Vi jobber som ett team, ikke som separate fagavdelinger med felles Teams-chat. |

### 6. Samarbeid med resten av organisasjonen

**Nøkkel:** `organization_collaboration`

**Introduksjon:** Er vi del av en velfungerende verdikjede?

**Hva området måler:** Samarbeid på tvers, avhengigheter, støtte og hvordan
bistand til andre team påvirker fokus.

| Nr. | Spørsmålsnøkkel | Påstand |
|---:|---|---|
| 24 | `org_collaboration_works` | Samarbeidet med andre team, fagmiljøer og forretningen fungerer godt. |
| 25 | `org_get_help_early` | Vi får avklaringer og hjelp fra andre før saken rekker å bli en langtidsparkert veteranbil. |
| 26 | `org_clear_dependencies` | Roller, ansvar og avhengigheter mellom oss og andre team er tydelige. |
| 27 | `org_support_prioritized` | Når vi hjelper andre team, er oppdraget tydelig prioritert og planlagt. |
| 28 | `org_support_valuable` | Hjelp til andre team oppleves som verdifullt samarbeid, ikke bare tilfeldige avbrytelser. |

### 7. Læring og forbedring

**Nøkkel:** `learning_improvement`

**Introduksjon:** Blir vi litt klokere mellom hver produksjonssetting?

**Hva området måler:** Læringskultur, forbedringsevne og bruk av analyse og
innsikt.

| Nr. | Spørsmålsnøkkel | Påstand |
|---:|---|---|
| 29 | `learning_regularly` | Vi lærer regelmessig noe som gjør oss bedre som team eller fagpersoner. |
| 30 | `learning_act_on_problems` | Når vi ser noe som ikke fungerer, klarer vi faktisk å gjøre noe med det. |
| 31 | `learning_use_insight` | Vi bruker innsikt og data til å utfordre antakelser og forbedre løsningene våre. |

## Template-kontrakt

- `template_version`: `squad-health-v1`
- antall områder: 7
- antall spørsmål: 31
- alle spørsmålsnøkler er unike
- hvert spørsmål tilhører nøyaktig ett område
- rekkefølgen over brukes i UI, PDF og CSV
- en språklig eller semantisk endring etter første måling lager ny versjon
