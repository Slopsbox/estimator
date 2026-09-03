import { Turnstile } from '@marsidev/react-turnstile';

interface TurnstileGateProps {
  onSuccess: (token: string) => void;
  theme?: 'light' | 'dark' | 'auto';
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

/**
 * Cloudflare Turnstile-widget.
 * Kaller onSuccess med token når bruker er verifisert.
 * Produksjon feiler lukket dersom nøkkelen mangler.
 */
export function TurnstileGate({ onSuccess, theme = 'light' }: TurnstileGateProps) {
  const siteKey = SITE_KEY || (import.meta.env.DEV ? '1x00000000000000000000AA' : null);

  if (!siteKey) {
    return <p role="alert" className="text-center text-sm">Verifisering er ikke konfigurert.</p>;
  }

  return (
    <div className="flex justify-center">
      <Turnstile
        siteKey={siteKey}
        onSuccess={onSuccess}
        options={{ theme, size: 'normal' }}
      />
    </div>
  );
}
