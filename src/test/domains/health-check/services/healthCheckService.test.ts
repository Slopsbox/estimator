import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flattenHealthCheckQuestions, SQUAD_HEALTH_TEMPLATE_V1 } from '../../../../domains/health-check/domain';
import {
  createHealthCheckService,
  type CreateHealthCheckRoomInput,
  type HealthCheckGateway,
  type HealthCheckResponseMap,
  type HealthCheckRpcPort,
  type JoinHealthCheckRoomInput,
} from '../../../../domains/health-check/services';

const ROOM_ID = '10000000-0000-0000-0000-000000000001';
const MEMBER_ID = '20000000-0000-0000-0000-000000000002';
const JOB_ID = '30000000-0000-0000-0000-000000000003';
const EXPIRES_AT = '2026-08-26T12:34:56.123456+00:00';

const STATE = {
  phase: 'lobby',
  template_version: 'squad-health-v1',
  squad_name: 'Plattform',
  measurement_date: '2026-08-26',
  respondent_state: null,
  role: 'facilitator',
};

const validResponses = (): HealthCheckResponseMap => Object.fromEntries(
  flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1).map((question) => [
    question.key,
    ((question.sequence - 1) % 7) + 1,
  ]),
) as HealthCheckResponseMap;

function prototypeReport() {
  return {
    status: 'completed',
    report_schema_version: 'health-check-prototype-v1',
    squad_name: 'Plattform',
    measurement_date: '2026-08-26',
    template_version: 'squad-health-v1',
    response_count: 3,
    areas: SQUAD_HEALTH_TEMPLATE_V1.areas.map((area, areaIndex) => ({
      area_key: area.key,
      sequence: areaIndex + 1,
      title: area.title,
      average: 4.5,
      questions: area.questions.map((question) => ({
        question_key: question.key,
        sequence: question.sequence,
        text: question.text,
        average: 4.5,
      })),
    })),
  };
}

describe('healthCheckService', () => {
  const rpc = vi.fn<HealthCheckRpcPort['rpc']>();
  const ensureIdentity = vi.fn<() => Promise<unknown>>();
  const service = createHealthCheckService({ rpc: { rpc }, ensureIdentity });

  beforeEach(() => {
    vi.clearAllMocks();
    ensureIdentity.mockResolvedValue({ id: 'authenticated-user' });
  });

  it('uses the exact RPC names and arguments and parses safe results', async () => {
    rpc
      .mockResolvedValueOnce({ data: STATE, error: null })
      .mockResolvedValueOnce({
        data: { status: 'ok', phase: 'collecting', template_version: 'squad-health-v1' },
        error: null,
      })
      .mockResolvedValueOnce({ data: { status: 'completed' }, error: null })
      .mockResolvedValueOnce({
        data: [{ member_id: MEMBER_ID, display_name: 'Ada', status: 'in_progress' }],
        error: null,
      })
      .mockResolvedValueOnce({ data: { status: 'removed' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'aborted' }, error: null })
      .mockResolvedValueOnce({
        data: {
          status: 'download_pending',
          job_id: JOB_ID,
          job_status: 'awaiting_materialization',
          expires_at: EXPIRES_AT,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: 'ready',
          filename: 'plattform-2026-08-26.zip',
          expires_at: EXPIRES_AT,
        },
        error: null,
      });

    await expect(service.getState(ROOM_ID)).resolves.toEqual({
      ok: true,
      value: {
        phase: 'lobby',
        templateVersion: 'squad-health-v1',
        squadName: 'Plattform',
        measurementDate: '2026-08-26',
        respondentState: null,
        role: 'facilitator',
      },
    });
    await expect(service.start(ROOM_ID)).resolves.toEqual({
      ok: true,
      value: { status: 'ok', phase: 'collecting', templateVersion: 'squad-health-v1' },
    });
    await expect(service.submit(ROOM_ID, validResponses())).resolves.toEqual({
      ok: true,
      value: { status: 'completed' },
    });
    await expect(service.getProgress(ROOM_ID)).resolves.toEqual({
      ok: true,
      value: [{ memberId: MEMBER_ID, displayName: 'Ada', status: 'in_progress' }],
    });
    await expect(service.removeRespondent(ROOM_ID, MEMBER_ID)).resolves.toEqual({
      ok: true,
      value: { status: 'removed' },
    });
    await expect(service.abort(ROOM_ID)).resolves.toEqual({
      ok: true,
      value: { status: 'aborted' },
    });
    await expect(service.finalize(ROOM_ID)).resolves.toEqual({
      ok: true,
      value: {
        status: 'download_pending',
        jobId: JOB_ID,
        jobStatus: 'awaiting_materialization',
        expiresAt: EXPIRES_AT,
      },
    });
    await expect(service.getDownloadStatus(JOB_ID)).resolves.toEqual({
      ok: true,
      value: { status: 'ready', filename: 'plattform-2026-08-26.zip', expiresAt: EXPIRES_AT },
    });

    expect(rpc.mock.calls.map(([name, args]) => [name, args])).toEqual([
      ['get_health_check_state', { p_room_id: ROOM_ID }],
      ['start_health_check', { p_room_id: ROOM_ID }],
      ['submit_health_check', {
        p_room_id: ROOM_ID,
        p_scores: Array.from({ length: 31 }, (_, index) => (index % 7) + 1),
      }],
      ['get_health_check_progress', { p_room_id: ROOM_ID }],
      ['remove_health_check_respondent', { p_room_id: ROOM_ID, p_member_id: MEMBER_ID }],
      ['abort_health_check', { p_room_id: ROOM_ID }],
      ['finalize_health_check', { p_room_id: ROOM_ID }],
      ['get_health_check_download_status', { p_job_id: JOB_ID }],
    ]);
    expect(ensureIdentity).toHaveBeenCalledTimes(8);
  });

  it.each([
    ['getState', () => service.getState(ROOM_ID)],
    ['start', () => service.start(ROOM_ID)],
    ['submit', () => service.submit(ROOM_ID, validResponses())],
    ['getProgress', () => service.getProgress(ROOM_ID)],
    ['removeRespondent', () => service.removeRespondent(ROOM_ID, MEMBER_ID)],
    ['abort', () => service.abort(ROOM_ID)],
    ['finalize', () => service.finalize(ROOM_ID)],
    ['getDownloadStatus', () => service.getDownloadStatus(JOB_ID)],
  ])('returns identity and skips %s RPC when authentication fails', async (_name, run) => {
    ensureIdentity.mockRejectedValueOnce(new Error('private identity detail'));

    await expect(run()).resolves.toEqual({ ok: false, reason: 'identity' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['28000', 'identity'],
    ['42501', 'forbidden'],
    ['22023', 'domain_conflict'],
    ['PGRST500', 'rpc'],
    [undefined, 'rpc'],
  ] as const)('maps normalized RPC code %s to %s without exposing details', async (code, reason) => {
    rpc.mockResolvedValue({ data: null, error: { code } });

    await expect(service.start(ROOM_ID)).resolves.toEqual({ ok: false, reason });
  });

  it('normalizes thrown RPC failures', async () => {
    rpc.mockRejectedValue(new Error('private database detail'));

    await expect(service.start(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'rpc' });
  });

  it.each([
    ['not-a-uuid', () => service.getState('not-a-uuid')],
    ['invalid member', () => service.removeRespondent(ROOM_ID, 'member-1')],
  ])('rejects %s before identity and RPC', async (_name, run) => {
    await expect(run()).resolves.toEqual({ ok: false, reason: 'domain_conflict' });
    expect(ensureIdentity).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...STATE, template_version: 'squad-health-v2' },
    { ...STATE, phase: 'collecting', role: 'participant', respondent_state: null },
    { ...STATE, secret_score: 7 },
  ])('rejects malformed or cross-type state %#', async (data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(service.getState(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects state accessors and custom prototypes without invoking getters', async () => {
    let getterRan = false;
    const accessorState = { ...STATE };
    Object.defineProperty(accessorState, 'squad_name', {
      enumerable: true,
      get() {
        getterRan = true;
        return 'Leaked';
      },
    });
    rpc.mockResolvedValueOnce({ data: accessorState, error: null });

    await expect(service.getState(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });
    expect(getterRan).toBe(false);

    const polluted = Object.assign(Object.create({ role: 'facilitator' }), STATE);
    rpc.mockResolvedValueOnce({ data: polluted, error: null });
    await expect(service.getState(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each(['', '   ', ' trailing ', 'a'.repeat(81)])(
    'rejects unsafe state squad name %#',
    async (squadName) => {
      rpc.mockResolvedValue({ data: { ...STATE, squad_name: squadName }, error: null });

      await expect(service.getState(ROOM_ID)).resolves.toEqual({
        ok: false,
        reason: 'malformed',
      });
    },
  );

  it('counts Unicode code points like the database name contract', async () => {
    rpc.mockResolvedValue({ data: { ...STATE, squad_name: '😀'.repeat(80) }, error: null });

    await expect(service.getState(ROOM_ID)).resolves.toMatchObject({ ok: true });
  });

  it('orders exactly 31 validated responses by template sequence', async () => {
    const reversed = Object.fromEntries(
      Object.entries(validResponses()).reverse(),
    ) as HealthCheckResponseMap;
    rpc.mockResolvedValue({ data: { status: 'completed' }, error: null });

    await service.submit(ROOM_ID, reversed);

    expect(rpc).toHaveBeenCalledWith('submit_health_check', {
      p_room_id: ROOM_ID,
      p_scores: Array.from({ length: 31 }, (_, index) => (index % 7) + 1),
    });
  });

  it('parses the exact 7-area and 31-question terminal prototype result', async () => {
    rpc.mockResolvedValue({ data: prototypeReport(), error: null });

    const result = await service.finalizePrototype(ROOM_ID);

    expect(rpc).toHaveBeenCalledWith('finalize_health_check_prototype', { p_room_id: ROOM_ID });
    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'completed',
        reportSchemaVersion: 'health-check-prototype-v1',
        squadName: 'Plattform',
        responseCount: 3,
      },
    });
    if (!result.ok) throw new Error('Expected terminal report');
    expect(result.value.areas).toHaveLength(7);
    expect(result.value.areas.flatMap((area) => area.questions)).toHaveLength(31);
  });

  it.each([
    { response_count: 0 },
    { areas: prototypeReport().areas.slice(0, 6) },
    { areas: prototypeReport().areas.map((area, index) => index === 0 ? { ...area, average: 8 } : area) },
    { areas: prototypeReport().areas.map((area, index) => index === 0 ? { ...area, area_key: 'unknown' } : area) },
  ])('rejects malformed terminal prototype report %#', async (override) => {
    rpc.mockResolvedValue({ data: { ...prototypeReport(), ...override }, error: null });

    await expect(service.finalizePrototype(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each([
    Object.fromEntries(Object.entries(validResponses()).slice(1)),
    { ...validResponses(), joy_look_forward: 8 },
    { ...validResponses(), unknown_question: 4 },
  ])('rejects missing, invalid or extra responses before identity and transport', async (responses) => {
    await expect(service.submit(ROOM_ID, responses as unknown as HealthCheckResponseMap)).resolves.toEqual({
      ok: false,
      reason: 'invalid_responses',
    });
    expect(ensureIdentity).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never returns submitted scores when RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000' } });

    const result = await service.submit(ROOM_ID, validResponses());

    expect(result).toEqual({ ok: false, reason: 'rpc' });
    expect(JSON.stringify(result)).not.toContain('scores');
  });

  it('accepts only strict progress rows with exact safe fields', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ member_id: MEMBER_ID, display_name: 'Ada', status: 'completed', extra: true }],
      error: null,
    });
    await expect(service.getProgress(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });

    rpc.mockResolvedValueOnce({
      data: [{ member_id: ROOM_ID, display_name: 'Grace', status: 'waiting' }],
      error: null,
    });
    await expect(service.getProgress(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects progress accessors and custom prototypes without invoking getters', async () => {
    let getterRan = false;
    const accessorRow = { member_id: MEMBER_ID, display_name: 'Ada', status: 'completed' };
    Object.defineProperty(accessorRow, 'display_name', {
      enumerable: true,
      get() {
        getterRan = true;
        return 'Leaked';
      },
    });
    rpc.mockResolvedValueOnce({ data: [accessorRow], error: null });

    await expect(service.getProgress(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });
    expect(getterRan).toBe(false);

    const polluted = Object.assign(Object.create({ admin: true }), {
      member_id: MEMBER_ID,
      display_name: 'Ada',
      status: 'completed',
    });
    rpc.mockResolvedValueOnce({ data: [polluted], error: null });
    await expect(service.getProgress(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each([
    'awaiting_materialization',
    'processing',
    'ready',
    'failed',
    'expired',
  ] as const)('accepts finalize job status %s', async (jobStatus) => {
    rpc.mockResolvedValue({
      data: {
        status: 'download_pending',
        job_id: JOB_ID,
        job_status: jobStatus,
        expires_at: EXPIRES_AT,
      },
      error: null,
    });

    await expect(service.finalize(ROOM_ID)).resolves.toEqual({
      ok: true,
      value: { status: 'download_pending', jobId: JOB_ID, jobStatus, expiresAt: EXPIRES_AT },
    });
  });

  it('rejects unknown finalize job status and malformed job ID', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        status: 'download_pending',
        job_id: JOB_ID,
        job_status: 'cancelled',
        expires_at: EXPIRES_AT,
      },
      error: null,
    });
    await expect(service.finalize(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });

    rpc.mockResolvedValueOnce({
      data: {
        status: 'download_pending',
        job_id: 'job-1',
        job_status: 'ready',
        expires_at: EXPIRES_AT,
      },
      error: null,
    });
    await expect(service.finalize(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each([
    '2026-08-26',
    '2026-08-26T12:34:56',
    '2026-08-26T12:34:56Zextra',
    '2026-02-30T12:34:56Z',
    'not-a-date',
  ])('rejects invalid or unzoned finalize expiry %#', async (expiresAt) => {
    rpc.mockResolvedValue({
      data: {
        status: 'download_pending',
        job_id: JOB_ID,
        job_status: 'ready',
        expires_at: expiresAt,
      },
      error: null,
    });

    await expect(service.finalize(ROOM_ID)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each([
    [{ status: 'awaiting_materialization', filename: null, expires_at: EXPIRES_AT }, true],
    [{ status: 'processing', filename: null, expires_at: EXPIRES_AT }, true],
    [{ status: 'failed', filename: null, expires_at: EXPIRES_AT }, true],
    [{ status: 'expired', filename: null, expires_at: EXPIRES_AT }, true],
    [{ status: 'ready', filename: 'squad-2026-08-26.zip', expires_at: EXPIRES_AT }, true],
    [{ status: 'ready', filename: `${'😀'.repeat(176)}.zip`, expires_at: EXPIRES_AT }, true],
    [{ status: 'ready', filename: `${'😀'.repeat(177)}.zip`, expires_at: EXPIRES_AT }, false],
    [{ status: 'ready', filename: 'squad.zip', expires_at: EXPIRES_AT, aad_room_id: ROOM_ID }, false],
    [{ status: 'ready', filename: '../rapport.zip', expires_at: EXPIRES_AT }, false],
    [{ status: 'ready', filename: 'safe\u202etxt.zip', expires_at: EXPIRES_AT }, false],
    [{ status: 'ready', filename: null, expires_at: EXPIRES_AT }, false],
    [{ status: 'expired', filename: null, expires_at: '2026-08-26T12:34:56' }, false],
  ] as const)('parses download status %#', async (data, valid) => {
    rpc.mockResolvedValue({ data, error: null });
    const result = await service.getDownloadStatus(JOB_ID);
    expect(result.ok).toBe(valid);
  });
});

describe('HealthCheckGateway contract', () => {
  it.each([
    ['active_session_exists', 'session_not_found'],
    ['request_already_used', 'role_conflict'],
  ] as const)('represents create status %s and join status %s without casts', (createReason, joinReason) => {
    const gateway = {
      createHealthCheckRoom: async (_input: CreateHealthCheckRoomInput) => ({
        ok: false,
        reason: createReason,
      }),
      joinHealthCheckRoom: async (_input: JoinHealthCheckRoomInput) => ({
        ok: false,
        reason: joinReason,
      }),
    } satisfies HealthCheckGateway;

    expect(gateway).toBeDefined();
  });
});
