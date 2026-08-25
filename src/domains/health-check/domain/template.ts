function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }

  return value;
}

export const SQUAD_HEALTH_TEMPLATE_V1 = deepFreeze({
  version: 'squad-health-v1',
  scoreLabels: {
    1: 'Svært uenig',
    2: 'Uenig',
    3: 'Litt uenig',
    4: 'Nøytral',
    5: 'Litt enig',
    6: 'Enig',
    7: 'Svært enig',
  },
  areas: [
    {
      key: 'joy_energy',
      title: 'Arbeidsglede og energi',
      introduction: 'Er det fortsatt gøy å gå på jobb?',
      description:
        'Arbeidsglede, motivasjon, energi og om arbeidshverdagen oppleves bærekraftig.',
      questions: [
        { key: 'joy_look_forward', sequence: 1, text: 'Jeg gleder meg som regel til arbeidsdagen.' },
        {
          key: 'joy_energy_balance',
          sequence: 2,
          text: 'Oppgavene mine gir meg mer energi enn de tapper meg for.',
        },
        {
          key: 'joy_fun_together',
          sequence: 3,
          text: 'Vi har det gøy sammen, også når handlekurven velter.',
        },
        {
          key: 'joy_challenge_mastery',
          sequence: 4,
          text: 'Jeg opplever at det er en god balanse mellom utfordringer og mestring.',
        },
      ],
    },
    {
      key: 'people_safety',
      title: 'Menneskene og tryggheten',
      introduction: 'Kan vi være mennesker, ikke bare ressurser?',
      description:
        'Psykologisk trygghet, omsorg, hjelpekultur og bærekraftig arbeidsbelastning.',
      questions: [
        {
          key: 'safety_speak_up',
          sequence: 5,
          text: 'Jeg føler meg trygg på å si hva jeg mener i teamet.',
        },
        {
          key: 'safety_learn_from_mistakes',
          sequence: 6,
          text: 'Det er greit å gjøre feil, så lenge vi lærer og rydder opp etter oss.',
        },
        {
          key: 'safety_people_care',
          sequence: 7,
          text: 'Jeg opplever at menneskene rundt meg bryr seg om hvordan jeg har det.',
        },
        {
          key: 'safety_ask_for_help',
          sequence: 8,
          text: 'Jeg kan be om hjelp før varsellampene begynner å blinke.',
        },
        {
          key: 'safety_sustainable_pace',
          sequence: 9,
          text: 'Arbeidshverdagen min har et tempo jeg kan stå i over tid.',
        },
      ],
    },
    {
      key: 'direction_meaning',
      title: 'Oppgaver, retning og mening',
      introduction: 'Vet vi hvor vi skal, og hvorfor kunden bør bry seg?',
      description: 'Formål, kundeverdi, inspirasjon, fokus og teamets mulighet til å påvirke.',
      questions: [
        {
          key: 'direction_understand_outcome',
          sequence: 10,
          text: 'Jeg forstår hva teamet prøver å oppnå, ikke bare hva vi skal levere.',
        },
        {
          key: 'direction_meaningful_work',
          sequence: 11,
          text: 'Oppgavene jeg jobber med oppleves meningsfulle og inspirerende.',
        },
        {
          key: 'direction_customer_value',
          sequence: 12,
          text: 'Vi ser en tydelig sammenheng mellom arbeidet vårt og verdi for kunder, rådgivere eller Gjensidige.',
        },
        {
          key: 'direction_clear_priorities',
          sequence: 13,
          text: 'Vi har tydelige prioriteringer og slipper å forsikre alt mot alt samtidig.',
        },
        {
          key: 'direction_autonomy',
          sequence: 14,
          text: 'Vi får påvirke hvordan vi løser oppgavene, ikke bare ekspedere bestillingen.',
        },
      ],
    },
    {
      key: 'quality_technical_health',
      title: 'Kvalitet og teknisk helse',
      introduction: 'Er løsningen i god teknisk form, eller holdes den sammen med gaffateip?',
      description: 'Opplevd kvalitet, teknisk gjeld, leveransetrygghet og læring etter feil.',
      questions: [
        {
          key: 'quality_proud_to_ship',
          sequence: 15,
          text: 'Vi leverer løsninger vi er stolte av å sende ut til kundene.',
        },
        {
          key: 'quality_time_to_do_well',
          sequence: 16,
          text: 'Vi har nok tid og rom til å gjøre jobben skikkelig.',
        },
        {
          key: 'quality_debt_managed',
          sequence: 17,
          text: 'Teknisk gjeld og andre kvalitetsproblemer blir håndtert før de blir en dyr egenandel.',
        },
        {
          key: 'quality_safe_changes',
          sequence: 18,
          text: 'Det føles trygt og forutsigbart å gjøre endringer og produksjonssette.',
        },
        {
          key: 'quality_learn_without_blame',
          sequence: 19,
          text: 'Vi oppdager og lærer av feil uten å lete etter noen å skylde på.',
        },
      ],
    },
    {
      key: 'squad_collaboration',
      title: 'Samarbeid i squaden',
      introduction: 'Spiller fagområdene på samme lag?',
      description: 'Tverrfaglighet, involvering, likeverdig påvirkning og kunnskapsdeling.',
      questions: [
        {
          key: 'squad_involved_early',
          sequence: 20,
          text: 'Utvikling, design og analyse blir involvert tidlig nok i arbeidet.',
        },
        {
          key: 'squad_equal_influence',
          sequence: 21,
          text: 'Alle fagområdene blir lyttet til og har reell påvirkning på løsningene.',
        },
        {
          key: 'squad_share_and_help',
          sequence: 22,
          text: 'Vi deler kunnskap godt og hjelper hverandre når noen står fast.',
        },
        {
          key: 'squad_one_team',
          sequence: 23,
          text: 'Vi jobber som ett team, ikke som separate fagavdelinger med felles Teams-chat.',
        },
      ],
    },
    {
      key: 'organization_collaboration',
      title: 'Samarbeid med resten av organisasjonen',
      introduction: 'Er vi del av en velfungerende verdikjede?',
      description:
        'Samarbeid på tvers, avhengigheter, støtte og hvordan bistand til andre team påvirker fokus.',
      questions: [
        {
          key: 'org_collaboration_works',
          sequence: 24,
          text: 'Samarbeidet med andre team, fagmiljøer og forretningen fungerer godt.',
        },
        {
          key: 'org_get_help_early',
          sequence: 25,
          text: 'Vi får avklaringer og hjelp fra andre før saken rekker å bli en langtidsparkert veteranbil.',
        },
        {
          key: 'org_clear_dependencies',
          sequence: 26,
          text: 'Roller, ansvar og avhengigheter mellom oss og andre team er tydelige.',
        },
        {
          key: 'org_support_prioritized',
          sequence: 27,
          text: 'Når vi hjelper andre team, er oppdraget tydelig prioritert og planlagt.',
        },
        {
          key: 'org_support_valuable',
          sequence: 28,
          text: 'Hjelp til andre team oppleves som verdifullt samarbeid, ikke bare tilfeldige avbrytelser.',
        },
      ],
    },
    {
      key: 'learning_improvement',
      title: 'Læring og forbedring',
      introduction: 'Blir vi litt klokere mellom hver produksjonssetting?',
      description: 'Læringskultur, forbedringsevne og bruk av analyse og innsikt.',
      questions: [
        {
          key: 'learning_regularly',
          sequence: 29,
          text: 'Vi lærer regelmessig noe som gjør oss bedre som team eller fagpersoner.',
        },
        {
          key: 'learning_act_on_problems',
          sequence: 30,
          text: 'Når vi ser noe som ikke fungerer, klarer vi faktisk å gjøre noe med det.',
        },
        {
          key: 'learning_use_insight',
          sequence: 31,
          text: 'Vi bruker innsikt og data til å utfordre antakelser og forbedre løsningene våre.',
        },
      ],
    },
  ],
} as const);

export type HealthCheckTemplate = typeof SQUAD_HEALTH_TEMPLATE_V1;
export type TemplateVersion = HealthCheckTemplate['version'];
export type Area = HealthCheckTemplate['areas'][number];
export type AreaKey = Area['key'];
export type Question = Area['questions'][number];
export type QuestionKey = Question['key'];
