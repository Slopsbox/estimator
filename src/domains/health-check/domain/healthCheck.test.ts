import { describe, expect, it } from 'vitest';
import {
  SQUAD_HEALTH_TEMPLATE_V1,
  aggregateHealthCheckSnapshot,
  flattenHealthCheckQuestions,
  getHealthCheckArea,
  getHealthCheckQuestion,
  getHealthScoreLabel,
  presentHealthCheckAggregate,
  validateHealthCheckResponses,
  type QuestionKey,
  type SevenPointScore,
} from './index';

const expectedAreas = [
  {
    key: 'joy_energy',
    title: 'Arbeidsglede og energi',
    introduction: 'Er det fortsatt gøy å gå på jobb?',
    description:
      'Arbeidsglede, motivasjon, energi og om arbeidshverdagen oppleves bærekraftig.',
    questions: [
      ['joy_look_forward', 'Jeg gleder meg som regel til arbeidsdagen.'],
      ['joy_energy_balance', 'Oppgavene mine gir meg mer energi enn de tapper meg for.'],
      ['joy_fun_together', 'Vi har det gøy sammen, også når handlekurven velter.'],
      [
        'joy_challenge_mastery',
        'Jeg opplever at det er en god balanse mellom utfordringer og mestring.',
      ],
    ],
  },
  {
    key: 'people_safety',
    title: 'Menneskene og tryggheten',
    introduction: 'Kan vi være mennesker, ikke bare ressurser?',
    description: 'Psykologisk trygghet, omsorg, hjelpekultur og bærekraftig arbeidsbelastning.',
    questions: [
      ['safety_speak_up', 'Jeg føler meg trygg på å si hva jeg mener i teamet.'],
      [
        'safety_learn_from_mistakes',
        'Det er greit å gjøre feil, så lenge vi lærer og rydder opp etter oss.',
      ],
      [
        'safety_people_care',
        'Jeg opplever at menneskene rundt meg bryr seg om hvordan jeg har det.',
      ],
      ['safety_ask_for_help', 'Jeg kan be om hjelp før varsellampene begynner å blinke.'],
      ['safety_sustainable_pace', 'Arbeidshverdagen min har et tempo jeg kan stå i over tid.'],
    ],
  },
  {
    key: 'direction_meaning',
    title: 'Oppgaver, retning og mening',
    introduction: 'Vet vi hvor vi skal, og hvorfor kunden bør bry seg?',
    description: 'Formål, kundeverdi, inspirasjon, fokus og teamets mulighet til å påvirke.',
    questions: [
      [
        'direction_understand_outcome',
        'Jeg forstår hva teamet prøver å oppnå, ikke bare hva vi skal levere.',
      ],
      [
        'direction_meaningful_work',
        'Oppgavene jeg jobber med oppleves meningsfulle og inspirerende.',
      ],
      [
        'direction_customer_value',
        'Vi ser en tydelig sammenheng mellom arbeidet vårt og verdi for kunder, rådgivere eller Gjensidige.',
      ],
      [
        'direction_clear_priorities',
        'Vi har tydelige prioriteringer og slipper å forsikre alt mot alt samtidig.',
      ],
      [
        'direction_autonomy',
        'Vi får påvirke hvordan vi løser oppgavene, ikke bare ekspedere bestillingen.',
      ],
    ],
  },
  {
    key: 'quality_technical_health',
    title: 'Kvalitet og teknisk helse',
    introduction: 'Er løsningen i god teknisk form, eller holdes den sammen med gaffateip?',
    description: 'Opplevd kvalitet, teknisk gjeld, leveransetrygghet og læring etter feil.',
    questions: [
      ['quality_proud_to_ship', 'Vi leverer løsninger vi er stolte av å sende ut til kundene.'],
      ['quality_time_to_do_well', 'Vi har nok tid og rom til å gjøre jobben skikkelig.'],
      [
        'quality_debt_managed',
        'Teknisk gjeld og andre kvalitetsproblemer blir håndtert før de blir en dyr egenandel.',
      ],
      [
        'quality_safe_changes',
        'Det føles trygt og forutsigbart å gjøre endringer og produksjonssette.',
      ],
      [
        'quality_learn_without_blame',
        'Vi oppdager og lærer av feil uten å lete etter noen å skylde på.',
      ],
    ],
  },
  {
    key: 'squad_collaboration',
    title: 'Samarbeid i squaden',
    introduction: 'Spiller fagområdene på samme lag?',
    description: 'Tverrfaglighet, involvering, likeverdig påvirkning og kunnskapsdeling.',
    questions: [
      [
        'squad_involved_early',
        'Utvikling, design og analyse blir involvert tidlig nok i arbeidet.',
      ],
      [
        'squad_equal_influence',
        'Alle fagområdene blir lyttet til og har reell påvirkning på løsningene.',
      ],
      ['squad_share_and_help', 'Vi deler kunnskap godt og hjelper hverandre når noen står fast.'],
      [
        'squad_one_team',
        'Vi jobber som ett team, ikke som separate fagavdelinger med felles Teams-chat.',
      ],
    ],
  },
  {
    key: 'organization_collaboration',
    title: 'Samarbeid med resten av organisasjonen',
    introduction: 'Er vi del av en velfungerende verdikjede?',
    description:
      'Samarbeid på tvers, avhengigheter, støtte og hvordan bistand til andre team påvirker fokus.',
    questions: [
      [
        'org_collaboration_works',
        'Samarbeidet med andre team, fagmiljøer og forretningen fungerer godt.',
      ],
      [
        'org_get_help_early',
        'Vi får avklaringer og hjelp fra andre før saken rekker å bli en langtidsparkert veteranbil.',
      ],
      [
        'org_clear_dependencies',
        'Roller, ansvar og avhengigheter mellom oss og andre team er tydelige.',
      ],
      [
        'org_support_prioritized',
        'Når vi hjelper andre team, er oppdraget tydelig prioritert og planlagt.',
      ],
      [
        'org_support_valuable',
        'Hjelp til andre team oppleves som verdifullt samarbeid, ikke bare tilfeldige avbrytelser.',
      ],
    ],
  },
  {
    key: 'learning_improvement',
    title: 'Læring og forbedring',
    introduction: 'Blir vi litt klokere mellom hver produksjonssetting?',
    description: 'Læringskultur, forbedringsevne og bruk av analyse og innsikt.',
    questions: [
      [
        'learning_regularly',
        'Vi lærer regelmessig noe som gjør oss bedre som team eller fagpersoner.',
      ],
      [
        'learning_act_on_problems',
        'Når vi ser noe som ikke fungerer, klarer vi faktisk å gjøre noe med det.',
      ],
      [
        'learning_use_insight',
        'Vi bruker innsikt og data til å utfordre antakelser og forbedre løsningene våre.',
      ],
    ],
  },
] as const;

const questions = () => flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1);

const validResponses = (): Record<string, unknown> =>
  Object.fromEntries(questions().map((question) => [question.key, 4]));

const validSnapshot = (count = 5, score = 4) => ({
  templateVersion: 'squad-health-v1',
  expectedRespondentCount: count,
  questions: Object.fromEntries(
    questions().map((question) => [question.key, { sum: count * score, count }]),
  ),
});

describe('SQUAD_HEALTH_TEMPLATE_V1', () => {
  it('har eksakt versjon, områdedata, spørsmålstekst og rekkefølge fra v1-dokumentet', () => {
    expect(SQUAD_HEALTH_TEMPLATE_V1.version).toBe('squad-health-v1');
    expect(SQUAD_HEALTH_TEMPLATE_V1.scoreLabels).toEqual({
      1: 'Svært uenig',
      2: 'Uenig',
      3: 'Litt uenig',
      4: 'Nøytral',
      5: 'Litt enig',
      6: 'Enig',
      7: 'Svært enig',
    });
    expect(SQUAD_HEALTH_TEMPLATE_V1.areas).toHaveLength(7);
    expect(
      SQUAD_HEALTH_TEMPLATE_V1.areas.map((area) => ({
        key: area.key,
        title: area.title,
        introduction: area.introduction,
        description: area.description,
        questions: area.questions.map((question) => [question.key, question.text]),
      })),
    ).toEqual(expectedAreas);
  });

  it('har 31 unike spørsmål med sekvens 1..31 og én områdetilknytning', () => {
    const flattened = questions();
    const areaKeys = SQUAD_HEALTH_TEMPLATE_V1.areas.map((area) => area.key);
    const questionKeys = flattened.map((question) => question.key);

    expect(flattened).toHaveLength(31);
    expect(new Set(areaKeys)).toHaveLength(7);
    expect(new Set(questionKeys)).toHaveLength(31);
    expect(flattened.map((question) => question.sequence)).toEqual(
      Array.from({ length: 31 }, (_, index) => index + 1),
    );
    expect(
      SQUAD_HEALTH_TEMPLATE_V1.areas.flatMap((area) =>
        area.questions.map((question) => [question.key, area.key]),
      ),
    ).toHaveLength(31);
  });

  it('henter spørsmål og område etter key', () => {
    expect(getHealthCheckQuestion('quality_safe_changes')?.sequence).toBe(18);
    expect(getHealthCheckArea('learning_improvement')?.title).toBe('Læring og forbedring');
    expect(getHealthCheckQuestion('unknown')).toBeUndefined();
    expect(getHealthCheckArea('unknown')).toBeUndefined();
  });

  it('er deep frozen i runtime', () => {
    expect(Object.isFrozen(SQUAD_HEALTH_TEMPLATE_V1)).toBe(true);
    expect(Object.isFrozen(SQUAD_HEALTH_TEMPLATE_V1.scoreLabels)).toBe(true);
    expect(Object.isFrozen(SQUAD_HEALTH_TEMPLATE_V1.areas)).toBe(true);
    expect(Object.isFrozen(SQUAD_HEALTH_TEMPLATE_V1.areas[0])).toBe(true);
    expect(Object.isFrozen(SQUAD_HEALTH_TEMPLATE_V1.areas[0].questions)).toBe(true);
    expect(Object.isFrozen(SQUAD_HEALTH_TEMPLATE_V1.areas[0].questions[0])).toBe(true);

    const mutable = SQUAD_HEALTH_TEMPLATE_V1 as unknown as {
      areas: Array<{ title: string }>;
    };
    expect(() => {
      mutable.areas[0].title = 'Mutert';
    }).toThrow(TypeError);
    expect(SQUAD_HEALTH_TEMPLATE_V1.areas[0].title).toBe('Arbeidsglede og energi');
  });
});

describe('getHealthScoreLabel', () => {
  it.each([
    [1, 'Svært uenig'],
    [2, 'Uenig'],
    [3, 'Litt uenig'],
    [4, 'Nøytral'],
    [5, 'Litt enig'],
    [6, 'Enig'],
    [7, 'Svært enig'],
  ] as const)('mapper %i til %s', (score, label) => {
    expect(getHealthScoreLabel(score)).toBe(label);
  });

  it.each([0, 8, 1.5, Number.NaN, '4', null])('avviser ugyldig verdi %s', (score) => {
    expect(() => getHealthScoreLabel(score)).toThrow(RangeError);
  });
});

describe('validateHealthCheckResponses', () => {
  it('normaliserer nøyaktig alle spørsmål med heltall 1..7 til en typet svarmap', () => {
    const result = validateHealthCheckResponses(validResponses());

    expect(result).toEqual({ valid: true, value: validResponses() });
    if (!result.valid) return;
    const responses: Readonly<Record<QuestionKey, SevenPointScore>> = result.value;
    expect(responses.joy_look_forward).toBe(4);
  });

  it.each([null, undefined, [], 'responses', 4])('avviser malformed input uten å kaste: %s', (input) => {
    expect(() => validateHealthCheckResponses(input)).not.toThrow();
    expect(validateHealthCheckResponses(input).valid).toBe(false);
  });

  it('avviser revoked proxy uten å kaste', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(() => validateHealthCheckResponses(proxy)).not.toThrow();
    expect(() => aggregateHealthCheckSnapshot(proxy)).not.toThrow();
  });

  it('godtar en null-prototype record', () => {
    const responses = Object.assign(Object.create(null) as Record<string, unknown>, validResponses());

    expect(validateHealthCheckResponses(responses).valid).toBe(true);
  });

  it('avviser custom prototype', () => {
    const responses = Object.assign(Object.create({ inherited: true }), validResponses());

    expect(validateHealthCheckResponses(responses).valid).toBe(false);
  });

  it('avviser accessor uten å evaluere getter', () => {
    const responses = validResponses();
    let getterRan = false;
    Object.defineProperty(responses, 'joy_look_forward', {
      enumerable: true,
      get() {
        getterRan = true;
        return 4;
      },
    });

    expect(validateHealthCheckResponses(responses).valid).toBe(false);
    expect(getterRan).toBe(false);
  });

  it('avviser accessor i ukjent ikke-enumerable property uten å evaluere getter', () => {
    const responses = validResponses();
    let getterRan = false;
    Object.defineProperty(responses, 'hidden', {
      get() {
        getterRan = true;
        return 4;
      },
    });

    expect(validateHealthCheckResponses(responses).valid).toBe(false);
    expect(getterRan).toBe(false);
  });

  it('avviser manglende spørsmål uten å returnere rå input', () => {
    const responses = validResponses();
    delete responses.joy_look_forward;

    expect(validateHealthCheckResponses(responses)).toEqual({
      valid: false,
      errors: [{ code: 'MISSING_QUESTION' }],
    });
  });

  it('avviser ekstra spørsmål', () => {
    expect(
      validateHealthCheckResponses({ ...validResponses(), unknown_question: 4 }),
    ).toEqual({ valid: false, errors: [{ code: 'UNKNOWN_QUESTION' }] });
  });

  it.each([
    [1.5, 'NON_INTEGER_SCORE'],
    [Number.MAX_SAFE_INTEGER + 1, 'NON_INTEGER_SCORE'],
    [0, 'SCORE_OUT_OF_RANGE'],
    [8, 'SCORE_OUT_OF_RANGE'],
  ] as const)('avviser score %s med generisk feilkode', (score, code) => {
    expect(
      validateHealthCheckResponses({ ...validResponses(), joy_look_forward: score }),
    ).toEqual({ valid: false, errors: [{ code }] });
  });
});

describe('aggregateHealthCheckSnapshot', () => {
  it('beregner spørsmålssnitt og områdegjennomsnitt fra uavrundede spørsmål', () => {
    const snapshot = validSnapshot(5, 4);
    snapshot.questions.joy_look_forward = { sum: 16, count: 5 };
    snapshot.questions.joy_energy_balance = { sum: 17, count: 5 };
    snapshot.questions.joy_fun_together = { sum: 18, count: 5 };
    snapshot.questions.joy_challenge_mastery = { sum: 19, count: 5 };

    const result = aggregateHealthCheckSnapshot(snapshot);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.questionAverages.slice(0, 4)).toEqual([
      { questionKey: 'joy_look_forward', areaKey: 'joy_energy', average: 3.2 },
      { questionKey: 'joy_energy_balance', areaKey: 'joy_energy', average: 3.4 },
      { questionKey: 'joy_fun_together', areaKey: 'joy_energy', average: 3.6 },
      { questionKey: 'joy_challenge_mastery', areaKey: 'joy_energy', average: 3.8 },
    ]);
    expect(result.value.areaAverages[0]).toEqual({ areaKey: 'joy_energy', average: 3.5 });
    expect(result.value.responseCount).toBe(5);
  });

  it.each([null, undefined, [], 'snapshot', 4])('avviser malformed snapshot uten å kaste: %s', (input) => {
    expect(() => aggregateHealthCheckSnapshot(input)).not.toThrow();
    expect(aggregateHealthCheckSnapshot(input).valid).toBe(false);
  });

  it('avviser manglende eller null nested aggregate uten å kaste', () => {
    const missingQuestions = { ...validSnapshot(), questions: undefined };
    const nullAggregate = validSnapshot();
    nullAggregate.questions.joy_look_forward = null as unknown as { sum: number; count: number };

    expect(() => aggregateHealthCheckSnapshot(missingQuestions)).not.toThrow();
    expect(aggregateHealthCheckSnapshot(missingQuestions).valid).toBe(false);
    expect(() => aggregateHealthCheckSnapshot(nullAggregate)).not.toThrow();
    expect(aggregateHealthCheckSnapshot(nullAggregate).valid).toBe(false);
  });

  it('godtar plain records med null prototype', () => {
    const snapshot = validSnapshot();
    snapshot.questions = Object.assign(Object.create(null), snapshot.questions);
    const nullPrototypeSnapshot = Object.assign(Object.create(null), snapshot);

    expect(aggregateHealthCheckSnapshot(nullPrototypeSnapshot).valid).toBe(true);
  });

  it('avviser custom prototype på alle recordnivåer', () => {
    const customSnapshot = Object.assign(Object.create({ inherited: true }), validSnapshot());
    const customQuestions = validSnapshot();
    customQuestions.questions = Object.assign(
      Object.create({ inherited: true }),
      customQuestions.questions,
    );
    const customAggregate = validSnapshot();
    customAggregate.questions.joy_look_forward = Object.assign(
      Object.create({ inherited: true }),
      customAggregate.questions.joy_look_forward,
    );

    expect(aggregateHealthCheckSnapshot(customSnapshot).valid).toBe(false);
    expect(aggregateHealthCheckSnapshot(customQuestions).valid).toBe(false);
    expect(aggregateHealthCheckSnapshot(customAggregate).valid).toBe(false);
  });

  it('avviser accessor uten å evaluere getter', () => {
    const snapshot = validSnapshot();
    let getterRan = false;
    Object.defineProperty(snapshot.questions.joy_look_forward, 'sum', {
      enumerable: true,
      get() {
        getterRan = true;
        return 20;
      },
    });

    expect(aggregateHealthCheckSnapshot(snapshot).valid).toBe(false);
    expect(getterRan).toBe(false);
  });

  it('vekter alle spørsmål i området likt og ikke allerede avrundede verdier', () => {
    const snapshot = validSnapshot(6, 4);
    snapshot.questions.joy_look_forward = { sum: 19, count: 6 };
    snapshot.questions.joy_energy_balance = { sum: 19, count: 6 };
    snapshot.questions.joy_fun_together = { sum: 20, count: 6 };
    snapshot.questions.joy_challenge_mastery = { sum: 20, count: 6 };

    const result = aggregateHealthCheckSnapshot(snapshot);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.areaAverages[0].average).toBe(78 / 24);
  });

  it('avviser null svar og godtar ett svar', () => {
    expect(aggregateHealthCheckSnapshot(validSnapshot(0))).toEqual({
      valid: false,
      errors: [{ code: 'COUNT_BELOW_MINIMUM' }],
    });
    expect(aggregateHealthCheckSnapshot(validSnapshot(1)).valid).toBe(true);
  });

  it('avviser ulik count mellom spørsmål', () => {
    const snapshot = validSnapshot();
    snapshot.questions.joy_look_forward = { sum: 24, count: 6 };

    expect(aggregateHealthCheckSnapshot(snapshot)).toEqual({
      valid: false,
      errors: [{ code: 'COUNT_MISMATCH' }],
    });
  });

  it('avviser count som ikke matcher forventet respondentkohort', () => {
    const snapshot = validSnapshot(6);
    snapshot.expectedRespondentCount = 5;

    expect(aggregateHealthCheckSnapshot(snapshot)).toEqual({
      valid: false,
      errors: [{ code: 'COUNT_MISMATCH' }],
    });
  });

  it.each([0, 5.5, Number.MAX_SAFE_INTEGER + 1])(
    'avviser ugyldig expectedRespondentCount: %s',
    (expectedRespondentCount) => {
      const snapshot = { ...validSnapshot(), expectedRespondentCount };

      expect(aggregateHealthCheckSnapshot(snapshot).valid).toBe(false);
    },
  );

  it.each([-1, 36])('avviser sum utenfor mulig scoreområde: %s', (sum) => {
    const snapshot = validSnapshot();
    snapshot.questions.joy_look_forward = { sum, count: 5 };

    expect(aggregateHealthCheckSnapshot(snapshot)).toEqual({
      valid: false,
      errors: [{ code: 'INVALID_SUM' }],
    });
  });

  it('avviser desimaltall for sum og count', () => {
    const invalidSum = validSnapshot();
    invalidSum.questions.joy_look_forward = { sum: 20.5, count: 5 };
    const invalidCount = validSnapshot();
    invalidCount.questions.joy_look_forward = { sum: 20, count: 5.5 };

    expect(aggregateHealthCheckSnapshot(invalidSum)).toEqual({
      valid: false,
      errors: [{ code: 'INVALID_SUM' }],
    });
    expect(aggregateHealthCheckSnapshot(invalidCount)).toEqual({
      valid: false,
      errors: [{ code: 'INVALID_COUNT' }],
    });
  });

  it('avviser unsafe integers for sum og count', () => {
    const invalidSum = validSnapshot();
    invalidSum.questions.joy_look_forward = {
      sum: Number.MAX_SAFE_INTEGER + 1,
      count: 5,
    };
    const invalidCount = validSnapshot();
    invalidCount.questions.joy_look_forward = {
      sum: 20,
      count: Number.MAX_SAFE_INTEGER + 1,
    };

    expect(aggregateHealthCheckSnapshot(invalidSum)).toEqual({
      valid: false,
      errors: [{ code: 'INVALID_SUM' }],
    });
    expect(aggregateHealthCheckSnapshot(invalidCount)).toEqual({
      valid: false,
      errors: [{ code: 'INVALID_COUNT' }],
    });
  });

  it('avviser ukjent template-versjon', () => {
    expect(
      aggregateHealthCheckSnapshot({ ...validSnapshot(), templateVersion: 'squad-health-v2' }),
    ).toEqual({ valid: false, errors: [{ code: 'INVALID_TEMPLATE_VERSION' }] });
  });

  it('avviser manglende og ukjente question keys', () => {
    const missing = validSnapshot();
    delete missing.questions.joy_look_forward;
    const extra = validSnapshot();
    extra.questions.unknown = { sum: 20, count: 5 };

    expect(aggregateHealthCheckSnapshot(missing)).toEqual({
      valid: false,
      errors: [{ code: 'MISSING_QUESTION' }],
    });
    expect(aggregateHealthCheckSnapshot(extra)).toEqual({
      valid: false,
      errors: [{ code: 'UNKNOWN_QUESTION' }],
    });
  });
});

describe('presentHealthCheckAggregate', () => {
  it('avrunder spørsmål og områder til én desimal uten å endre aggregatet', () => {
    const aggregate = {
      templateVersion: 'squad-health-v1' as const,
      responseCount: 6,
      questionAverages: [
        { questionKey: 'joy_look_forward', areaKey: 'joy_energy', average: 19 / 6 },
        { questionKey: 'joy_energy_balance', areaKey: 'joy_energy', average: 20 / 6 },
      ],
      areaAverages: [{ areaKey: 'joy_energy', average: 78 / 24 }],
    } as const;

    expect(presentHealthCheckAggregate(aggregate)).toEqual({
      templateVersion: 'squad-health-v1',
      responseCount: 6,
      questionAverages: [
        { questionKey: 'joy_look_forward', areaKey: 'joy_energy', average: 3.2 },
        { questionKey: 'joy_energy_balance', areaKey: 'joy_energy', average: 3.3 },
      ],
      areaAverages: [{ areaKey: 'joy_energy', average: 3.3 }],
    });
    expect(aggregate.questionAverages[0].average).toBe(19 / 6);
  });
});
