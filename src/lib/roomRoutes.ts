import type { RoomActivityType } from './types';

export type RoomRouteDestination = 'join' | 'participant' | 'facilitator';

const ROOM_ROUTES = {
  estimation: {
    join: '/estimation/join',
    participant: '/estimation/vote',
    facilitator: '/estimation/dashboard',
  },
  health_check: {
    join: '/health-check/join',
    participant: '/health-check/respond',
    facilitator: '/health-check/dashboard',
  },
} as const satisfies Record<RoomActivityType, Record<RoomRouteDestination, string>>;

export function resolveRoomRoute(
  activityType: RoomActivityType,
  destination: RoomRouteDestination,
): string {
  return ROOM_ROUTES[activityType][destination];
}
