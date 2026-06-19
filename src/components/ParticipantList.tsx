import type { Participant } from '../lib/types';

interface ParticipantListProps {
  participants: Participant[];
  loading: boolean;
}

/**
 * Viser liste over deltakere i sesjonen.
 */
export function ParticipantList({ participants, loading }: ParticipantListProps) {
  if (loading) {
    return <p className="text-gray-500 text-sm">Laster deltakere…</p>;
  }

  if (participants.length === 0) {
    return <p className="text-gray-500 text-sm">Ingen deltakere ennå.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
      {participants.map((p) => (
        <li key={p.id} className="flex items-center justify-between px-4 py-3 bg-white">
          <span className="font-medium text-gray-800">{p.name}</span>
          {p.role === 'facilitator' ? (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              Fasilitator
            </span>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              Deltaker
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
