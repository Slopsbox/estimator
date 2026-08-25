import { describe, expect, it } from 'vitest';
import { resolveRoomRoute } from '../../lib/roomRoutes';

describe('resolveRoomRoute', () => {
  it.each([
    ['estimation', 'join', '/estimation/join'],
    ['estimation', 'participant', '/estimation/vote'],
    ['estimation', 'facilitator', '/estimation/dashboard'],
    ['health_check', 'join', '/health-check/join'],
    ['health_check', 'participant', '/health-check/respond'],
    ['health_check', 'facilitator', '/health-check/dashboard'],
  ] as const)('løser %s %s uttømmende', (activityType, destination, expected) => {
    expect(resolveRoomRoute(activityType, destination)).toBe(expected);
  });
});
