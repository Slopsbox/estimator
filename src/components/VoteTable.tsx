import type { Participant, Vote } from '../lib/types';

const SIZE_LABELS: Record<string, string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
};

const VALUE_LABELS: Record<string, string> = {
  gold: '🥇 Gull',
  silver: '🥈 Sølv',
  bronze: '🥉 Bronse',
};

interface VoteTableProps {
  votes: Vote[];
  participants: Participant[];
  loading: boolean;
}

/**
 * Tabell som viser hvem som har stemt hva i gjeldende runde.
 * Kobler vote → participant via participant_id.
 */
export function VoteTable({ votes, participants, loading }: VoteTableProps) {
  if (loading) {
    return <p className="text-gray-500 text-sm">Laster stemmer…</p>;
  }

  if (votes.length === 0) {
    return <p className="text-gray-500 text-sm">Ingen stemmer ennå denne runden.</p>;
  }

  // Lag oppslag: participantId → name
  const participantMap = new Map(participants.map((p) => [p.id, p.name]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-2 border-b">Deltaker</th>
            <th className="px-4 py-2 border-b">Størrelse</th>
            <th className="px-4 py-2 border-b">Verdi</th>
          </tr>
        </thead>
        <tbody>
          {votes.map((vote) => (
            <tr key={vote.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">
                {participantMap.get(vote.participant_id) ?? '—'}
              </td>
              <td className="px-4 py-3">
                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold">
                  {SIZE_LABELS[vote.size] ?? vote.size}
                </span>
              </td>
              <td className="px-4 py-3">
                {VALUE_LABELS[vote.value] ?? vote.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
