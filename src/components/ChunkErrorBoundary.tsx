import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Fanger chunk-loading-feil (etter deploy med nye hashes)
 * og tvinger en full page reload for å hente oppdatert kode.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Sjekk om det er en chunk-loading-feil
    const isChunkError =
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Loading chunk') ||
      error.message.includes('Loading CSS chunk') ||
      error.name === 'ChunkLoadError';

    if (isChunkError) {
      // Tving full reload for å hente ny kode
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      // Vis en kort melding mens reload skjer
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F5F4F0',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          }}
        >
          <p style={{ color: '#6B6865', fontSize: 14 }}>Oppdaterer appen…</p>
        </div>
      );
    }
    return this.props.children;
  }
}
