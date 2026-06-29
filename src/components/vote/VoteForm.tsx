import { useState, useCallback } from 'react';
import { SIZES, VALUES, SIZE_DESCRIPTIONS, VALUE_DESCRIPTIONS } from '../../lib/constants';
import { NavyPageLayout } from '../NavyPageLayout';
import { BottomSheet } from '../BottomSheet';
import { useLongPress } from '../../hooks/useLongPress';
import type { Size, Value } from '../../lib/types';

interface VoteFormProps {
  name: string;
  currentRound: number;
  selectedSize: Size | null;
  selectedValue: Value | null;
  submitting: boolean;
  submitError: string | null;
  onSelectSize: (size: Size) => void;
  onSelectValue: (value: Value) => void;
  onVote: () => void;
  onBack: () => void;
}

// ── Info-sheet-innhold ──────────────────────────────────────

function SizeSheetContent({ sizeKey, label }: { sizeKey: Size; label: string }) {
  const info = SIZE_DESCRIPTIONS[sizeKey];
  return (
    <>
      <p
        style={{
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: 6,
          background: '#F5F4F0',
          fontSize: 13,
          fontWeight: 700,
          color: '#0B1D3A',
          marginBottom: 12,
        }}
      >
        {label}
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0B1D3A', margin: '0 0 4px' }}>
        {info.time}
      </h2>
      <p style={{ fontSize: 15, color: '#6B7280', margin: '0 0 20px' }}>
        {info.description}
      </p>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1D3A', margin: '0 0 6px' }}>
        Eksempel:
      </p>
      <p
        style={{
          fontSize: 14,
          color: '#4B5563',
          fontStyle: 'italic',
          padding: '12px 16px',
          borderRadius: 10,
          background: '#F5F4F0',
          margin: 0,
        }}
      >
        "{info.example}"
      </p>
    </>
  );
}

function ValueSheetContent({
  valueKey,
  emoji,
  label,
}: {
  valueKey: Value;
  emoji: string;
  label: string;
}) {
  const info = VALUE_DESCRIPTIONS[valueKey];
  return (
    <>
      <p
        style={{
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: 6,
          background: '#F5F4F0',
          fontSize: 13,
          fontWeight: 700,
          color: '#0B1D3A',
          marginBottom: 12,
        }}
      >
        {emoji} {label}
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0B1D3A', margin: '0 0 8px' }}>
        {info.description}
      </h2>
      <p style={{ fontSize: 15, color: '#6B7280', margin: 0 }}>
        {info.priority}
      </p>
    </>
  );
}

// ── SizeButton ──────────────────────────────────────────────

interface SizeButtonProps {
  sizeKey: Size;
  label: string;
  isSelected: boolean;
  submitting: boolean;
  onSelect: (key: Size) => void;
  onInfo: (key: Size) => void;
}

function SizeButton({ sizeKey, label, isSelected, submitting, onSelect, onInfo }: SizeButtonProps) {
  const { isPressed, progress, wasLongPress, handlers } = useLongPress({
    duration: 3000,
    onLongPress: useCallback(() => onInfo(sizeKey), [onInfo, sizeKey]),
  });

  const scale = isPressed ? 1 + progress * 0.08 : 1;

  return (
    <button
      type="button"
      onClick={() => {
        if (wasLongPress) return; // long press nettopp fullført – ikke velg
        onSelect(sizeKey);
      }}
      disabled={submitting}
      aria-pressed={isSelected}
      aria-label={`Størrelse ${label}`}
      className="flex-1 py-3 font-bold text-sm focus:outline-none"
      style={{
        borderRadius: 8,
        border: `1.5px solid ${isSelected ? 'transparent' : '#E2E0DC'}`,
        background: isSelected ? '#C8002D' : '#fff',
        color: isSelected ? '#fff' : '#0B1D3A',
        boxShadow: isSelected ? '0 4px 12px rgba(200,0,45,.25)' : 'none',
        transform: `scale(${scale.toFixed(4)})`,
        transition: isPressed ? 'none' : 'transform 200ms ease, background 150ms, border-color 150ms',
        cursor: submitting ? 'not-allowed' : 'pointer',
        willChange: 'transform',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
      {...handlers}
    >
      {label}
    </button>
  );
}

// ── ValueButton ─────────────────────────────────────────────

interface ValueButtonProps {
  valueKey: Value;
  emoji: string;
  label: string;
  desc: string;
  isSelected: boolean;
  submitting: boolean;
  onSelect: (key: Value) => void;
  onInfo: (key: Value) => void;
}

function ValueButton({
  valueKey,
  emoji,
  label,
  desc,
  isSelected,
  submitting,
  onSelect,
  onInfo,
}: ValueButtonProps) {
  const { isPressed, progress, wasLongPress, handlers } = useLongPress({
    duration: 3000,
    onLongPress: useCallback(() => onInfo(valueKey), [onInfo, valueKey]),
  });

  const scale = isPressed ? 1 + progress * 0.08 : 1;

  return (
    <button
      type="button"
      onClick={() => {
        if (wasLongPress) return;
        onSelect(valueKey);
      }}
      disabled={submitting}
      aria-pressed={isSelected}
      aria-label={`Verdi ${label}`}
      className="flex-1 flex flex-col items-center py-4 focus:outline-none"
      style={{
        minHeight: 100,
        borderRadius: 12,
        border: `1.5px solid ${isSelected ? '#C8002D' : '#E2E0DC'}`,
        background: isSelected ? '#FFE5EA' : '#fff',
        boxShadow: isSelected ? '0 2px 10px rgba(200,0,45,.20)' : 'none',
        transform: `scale(${scale.toFixed(4)})`,
        transition: isPressed ? 'none' : 'transform 200ms ease, background 150ms, border-color 150ms',
        cursor: submitting ? 'not-allowed' : 'pointer',
        willChange: 'transform',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
      {...handlers}
    >
      <span className="text-2xl mb-1">{emoji}</span>
      <span
        className="text-xs font-bold"
        style={{ color: isSelected ? '#C8002D' : '#0B1D3A' }}
      >
        {label}
      </span>
      <span className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
        {desc}
      </span>
    </button>
  );
}

// ── Hoved-komponent ─────────────────────────────────────────

type SheetContent =
  | { type: 'size'; key: Size }
  | { type: 'value'; key: Value }
  | null;

/**
 * State A – Stemmeform: deltaker velger størrelse og verdi.
 * Navy-topp-mønster (matching DeltagerJoin/fasilitator).
 * Hold inne knapp i 3 sek for å se forklaring.
 */
export function VoteForm({
  name,
  currentRound,
  selectedSize,
  selectedValue,
  submitting,
  submitError,
  onSelectSize,
  onSelectValue,
  onVote,
  onBack,
}: VoteFormProps) {
  const canVote = selectedSize !== null && selectedValue !== null;

  const [sheetContent, setSheetContent] = useState<SheetContent>(null);

  const handleSizeInfo = useCallback((key: Size) => {
    setSheetContent({ type: 'size', key });
  }, []);

  const handleValueInfo = useCallback((key: Value) => {
    setSheetContent({ type: 'value', key });
  }, []);

  const closeSheet = useCallback(() => setSheetContent(null), []);

  const roundBadge = (
    <span
      className="text-xs font-medium px-3 py-1 rounded-full"
      style={{
        background: 'rgba(255,255,255,0.1)',
        color: '#A0BADE',
      }}
    >
      Runde {currentRound}
    </span>
  );

  return (
    <>
      <NavyPageLayout
        roleLabel="Deltager"
        onBack={onBack}
        headerRight={roundBadge}
        navyContent={
          <div className="text-center">
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>
              Din stemme
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
              Velg størrelse og verdi
            </p>
            {name && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                Stemmer som: {name}
              </p>
            )}
          </div>
        }
      >
        <div className="space-y-5">
          {/* Størrelse */}
          <div>
            <p
              className="mb-2"
              style={{ fontSize: 14, fontWeight: 500, color: '#0B1D3A' }}
            >
              Størrelse
            </p>
            <div className="flex gap-2">
              {SIZES.map(({ key, label }) => (
                <SizeButton
                  key={key}
                  sizeKey={key}
                  label={label}
                  isSelected={selectedSize === key}
                  submitting={submitting}
                  onSelect={onSelectSize}
                  onInfo={handleSizeInfo}
                />
              ))}
            </div>
          </div>

          {/* Verdi */}
          <div>
            <p
              className="mb-2"
              style={{ fontSize: 14, fontWeight: 500, color: '#0B1D3A' }}
            >
              Verdi
            </p>
            <div className="flex gap-2">
              {VALUES.map(({ key, emoji, label, desc }) => (
                <ValueButton
                  key={key}
                  valueKey={key}
                  emoji={emoji}
                  label={label}
                  desc={desc}
                  isSelected={selectedValue === key}
                  submitting={submitting}
                  onSelect={onSelectValue}
                  onInfo={handleValueInfo}
                />
              ))}
            </div>
          </div>

          {/* Hint */}
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-neutral-400, #9E9B96)',
              textAlign: 'center',
              margin: '-8px 0 0',
            }}
          >
            Hold inne for beskrivelse
          </p>

          {/* Feilmelding */}
          {submitError && (
            <p style={{ fontSize: 13, color: '#C8002D', textAlign: 'center' }}>
              {submitError}
            </p>
          )}

          {/* Stem-knapp */}
          <button
            type="button"
            onClick={onVote}
            disabled={!canVote || submitting}
            className="w-full font-bold text-white text-base transition-all focus:outline-none"
            style={{
              height: 52,
              borderRadius: 12,
              background: '#C8002D',
              opacity: canVote && !submitting ? 1 : 0.4,
              cursor: canVote && !submitting ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'Sender…' : 'Stem 🗳️'}
          </button>
        </div>
      </NavyPageLayout>

      {/* Info bottom sheet */}
      <BottomSheet isOpen={sheetContent !== null} onClose={closeSheet}>
        {sheetContent?.type === 'size' && (
          <SizeSheetContent
            sizeKey={sheetContent.key}
            label={SIZES.find((s) => s.key === sheetContent.key)?.label ?? sheetContent.key.toUpperCase()}
          />
        )}
        {sheetContent?.type === 'value' && (
          <ValueSheetContent
            valueKey={sheetContent.key}
            emoji={VALUES.find((v) => v.key === sheetContent.key)?.emoji ?? ''}
            label={VALUES.find((v) => v.key === sheetContent.key)?.label ?? sheetContent.key}
          />
        )}
      </BottomSheet>
    </>
  );
}

export type { VoteFormProps };
