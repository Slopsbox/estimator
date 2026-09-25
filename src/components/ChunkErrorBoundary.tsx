import { Component, type ReactNode } from 'react';
import { recoverChunkLoadInBrowser } from '../lib/chunkRecovery';

interface Props {
  children: ReactNode;
}

interface State {
  status: 'healthy' | 'recovering' | 'chunk-failed' | 'generic-error';
}

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: '#F5F4F0',
  color: '#0B1D3A',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
} as const;

const buttonStyle = {
  border: 0,
  borderRadius: 8,
  padding: '10px 16px',
  background: '#0B1D3A',
  color: '#FFFFFF',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { status: 'healthy' };

  static getDerivedStateFromError(): State {
    return { status: 'generic-error' };
  }

  componentDidCatch(error: Error) {
    const recovery = recoverChunkLoadInBrowser(error);
    if (recovery === 'reloading') {
      this.setState({ status: 'recovering' });
    } else if (recovery === 'already-retried') {
      this.setState({ status: 'chunk-failed' });
    }
  }

  private reload = () => window.location.reload();

  render() {
    if (this.state.status === 'healthy') return this.props.children;

    if (this.state.status === 'recovering') {
      return (
        <main style={pageStyle} aria-live="polite">
          <p>Laster siste versjon av appen...</p>
        </main>
      );
    }

    const isChunkFailure = this.state.status === 'chunk-failed';
    return (
      <main style={pageStyle}>
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>
            {isChunkFailure ? 'Appen kunne ikke lastes' : 'Noe gikk galt'}
          </h1>
          <p style={{ margin: '0 0 20px', color: '#55514D', lineHeight: 1.5 }}>
            {isChunkFailure
              ? 'Vi klarte ikke å hente filene som trengs. Kontroller nettforbindelsen, og prøv igjen.'
              : 'Det oppstod en uventet feil. Du kan prøve å laste siden på nytt.'}
          </p>
          <button type="button" style={buttonStyle} onClick={this.reload}>
            {isChunkFailure ? 'Last siden på nytt' : 'Prøv på nytt'}
          </button>
        </div>
      </main>
    );
  }
}
