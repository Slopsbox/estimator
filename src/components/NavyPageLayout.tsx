import type { ReactNode } from 'react';

export interface NavyPageLayoutProps {
  /** Rollenavn vist sentrert i header (f.eks. "Deltager", "Fasilitator") */
  roleLabel: string;
  /** Valgfri tilbake-knapp handling. Hvis utelatt, vises ingen tilbake-knapp. */
  onBack?: () => void;
  /** Valgfri badge til høyre i header (f.eks. runde-badge) */
  headerRight?: ReactNode;
  /** Innhold i navy-seksjonen (under header-raden) – typisk ikon + tittel + undertekst */
  navyContent: ReactNode;
  /** Innhold i varm-grå-seksjonen (under navy) */
  children: ReactNode;
}

/**
 * Gjenbrukbar layout for sider med navy-topp og varm-grå bunn.
 * Brukes av deltager-sider og fasilitator-opprettings-view.
 *
 * Struktur:
 * ┌─────────────────────────────────────┐
 * │ Navy (#0B1D3A), border-radius bunn  │
 * │  [← tilbake] [roleLabel] [right]   │
 * │  navyContent (ikon, tittel, tekst)  │
 * └─────────────────────────────────────┘
 * ┌─────────────────────────────────────┐
 * │ Varm grå (#F5F4F0), flex-1          │
 * │  children                           │
 * └─────────────────────────────────────┘
 */
export function NavyPageLayout({
  roleLabel,
  onBack,
  headerRight,
  navyContent,
  children,
}: NavyPageLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F5F4F0' }}>
      {/* Navy topp-seksjon */}
      <div
        style={{
          background: '#0B1D3A',
          borderRadius: '0 0 24px 24px',
          padding: '16px 24px 40px',
        }}
      >
        {/* Header-rad */}
        <div className="flex items-center mb-8">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center w-9 h-9 focus:outline-none"
              style={{ color: 'white', background: 'transparent' }}
              aria-label="Tilbake"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M11 4L6 9l5 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : (
            /* Spacer venstre for symmetri */
            <div className="w-9" />
          )}

          <span
            className="flex-1 text-center font-medium"
            style={{ fontSize: 16, color: 'white' }}
          >
            {roleLabel}
          </span>

          {headerRight !== undefined ? (
            <div className="flex-shrink-0">{headerRight}</div>
          ) : (
            /* Spacer høyre for symmetri */
            <div className="w-9" />
          )}
        </div>

        {/* Innhold i navy-seksjonen */}
        {navyContent}
      </div>

      {/* Varm-grå-seksjon */}
      <div className="flex-1 px-6 pt-8">
        {children}
      </div>
    </div>
  );
}
