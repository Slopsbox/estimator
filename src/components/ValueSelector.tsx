import type { Value } from '../lib/types';

interface ValueOption {
  value: Value;
  label: string;
  emoji: string;
  description: string;
}

const VALUE_OPTIONS: ValueOption[] = [
  { value: 'gold', label: 'Gull', emoji: '🥇', description: 'Høy verdi' },
  { value: 'silver', label: 'Sølv', emoji: '🥈', description: 'Middels verdi' },
  { value: 'bronze', label: 'Bronse', emoji: '🥉', description: 'Lav verdi' },
];

interface ValueSelectorProps {
  selected: Value | null;
  onChange: (value: Value) => void;
  disabled?: boolean;
}

/**
 * Rad med verdiknapper: Gull, Sølv, Bronse
 */
export function ValueSelector({ selected, onChange, disabled = false }: ValueSelectorProps) {
  return (
    <div className="flex gap-3 justify-center flex-wrap">
      {VALUE_OPTIONS.map(({ value, label, emoji, description }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          disabled={disabled}
          aria-pressed={selected === value}
          className={[
            'flex flex-col items-center px-6 py-3 rounded-lg transition-colors',
            'border-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            selected === value
              ? 'bg-amber-50 border-amber-500 text-amber-800'
              : 'bg-white border-gray-300 text-gray-700 hover:border-amber-300 hover:bg-amber-50',
          ].join(' ')}
        >
          <span className="text-2xl" role="img" aria-label={label}>
            {emoji}
          </span>
          <span className="text-sm font-semibold mt-1">{label}</span>
          <span className="text-xs text-gray-500">{description}</span>
        </button>
      ))}
    </div>
  );
}
