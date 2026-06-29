import { useEffect, useRef } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * En enkel bottom sheet med overlay.
 * - Glir opp fra bunnen ved åpning (CSS transition).
 * - Drag-handle øverst.
 * - Lukkes ved klikk på overlay eller "Lukk"-knapp.
 * - Fanger focus ved åpning (tilgjengelighet).
 */
export function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Fang fokus inn i sheet ved åpning
  useEffect(() => {
    if (isOpen && sheetRef.current) {
      sheetRef.current.focus();
    }
  }, [isOpen]);

  // Lukk på Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(11, 29, 58, 0.4)',
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 250ms ease',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          background: '#FFFFFF',
          borderRadius: '16px 16px 0 0',
          padding: '12px 24px 40px',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
          outline: 'none',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: 'var(--color-neutral-200, #E2E0DC)',
            margin: '0 auto 20px',
          }}
        />

        {children}

        {/* Lukk-knapp */}
        <button
          type="button"
          onClick={onClose}
          className="w-full font-semibold transition-all focus:outline-none"
          style={{
            marginTop: 24,
            height: 48,
            borderRadius: 12,
            border: '1.5px solid #E2E0DC',
            background: '#fff',
            color: '#0B1D3A',
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Lukk
        </button>
      </div>
    </>
  );
}
