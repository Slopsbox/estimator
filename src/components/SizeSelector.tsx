import type { Size } from '../lib/types';

const SIZES: Size[] = ['xs', 's', 'm', 'l', 'xl'];

interface SizeSelectorProps {
  selected: Size | null;
  onChange: (size: Size) => void;
  disabled?: boolean;
}

/**
 * Rad med størrelsesknapper: xs → xl
 */
export function SizeSelector({ selected, onChange, disabled = false }: SizeSelectorProps) {
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {SIZES.map((size) => (
        <button
          key={size}
          type="button"
          onClick={() => onChange(size)}
          disabled={disabled}
          aria-pressed={selected === size}
          className={[
            'px-6 py-3 rounded-lg font-semibold text-sm uppercase tracking-wide transition-colors',
            'border-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            selected === size
              ? 'bg-blue-700 border-blue-700 text-white'
              : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50',
          ].join(' ')}
        >
          {size.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
