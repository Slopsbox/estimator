import { useEffect, useRef, useState } from 'react';
import { registerSW } from '../lib/registerServiceWorker';

export function AppUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const updateSW = useRef<(() => Promise<void>) | null>(null);
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    updateSW.current = registerSW({
      onNeedRefresh: () => setUpdateAvailable(true),
    });
  }, []);

  if (!updateAvailable) return null;

  const applyUpdate = async () => {
    if (!updateSW.current || updating) return;
    setUpdating(true);
    try {
      await updateSW.current();
    } catch {
      setUpdating(false);
    }
  };

  return (
    <aside
      role="region"
      aria-label="Appoppdatering"
      style={{
        position: 'fixed',
        zIndex: 1000,
        right: 16,
        bottom: 16,
        left: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        maxWidth: 560,
        marginLeft: 'auto',
        padding: 16,
        border: '1px solid #D7D3CC',
        borderRadius: 12,
        background: '#FFFFFF',
        color: '#0B1D3A',
        boxShadow: '0 12px 32px rgba(11, 29, 58, 0.18)',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <span role="status" aria-live="polite">En ny versjon av Estimat er klar.</span>
      <button
        type="button"
        disabled={updating}
        onClick={applyUpdate}
        style={{
          flexShrink: 0,
          border: 0,
          borderRadius: 8,
          padding: '10px 14px',
          background: '#0B1D3A',
          color: '#FFFFFF',
          font: 'inherit',
          fontWeight: 700,
          cursor: updating ? 'wait' : 'pointer',
        }}
      >
        {updating ? 'Oppdaterer...' : 'Oppdater appen'}
      </button>
    </aside>
  );
}
