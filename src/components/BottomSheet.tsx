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
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !sheetRef.current) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const sheet = sheetRef.current;
    const getFocusable = () => [...sheet.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    (getFocusable()[0] ?? sheet).focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        sheet.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
          opacity: 1,
          pointerEvents: 'auto',
          transition: 'opacity 250ms ease',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Informasjon om estimat"
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
          transform: 'translateY(0)',
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
          className="w-full font-semibold transition-all focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2"
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
