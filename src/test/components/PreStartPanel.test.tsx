import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreStartPanel } from '../../components/dashboard/PreStartPanel';
import type { Participant } from '../../lib/types';

// ── Hjelpere ────────────────────────────────────────────────

const makeParticipant = (id: string, name: string, role: 'facilitator' | 'participant' = 'participant'): Participant => ({
  id,
  session_id: 'sess-1',
  name,
  role,
  joined_at: new Date().toISOString(),
});

// ── PreStartPanel ───────────────────────────────────────────

describe('PreStartPanel', () => {
  it('viser "Ingen deltakere ennå" når lista er tom', () => {
    render(<PreStartPanel participants={[]} actionLoading={false} onStart={vi.fn()} />);
    expect(screen.getByText('Ingen deltakere ennå')).toBeInTheDocument();
  });

  it('viser antall deltakere (flertall) når flere deltar', () => {
    const p = [makeParticipant('1', 'Ola'), makeParticipant('2', 'Kari')];
    render(<PreStartPanel participants={p} actionLoading={false} onStart={vi.fn()} />);
    expect(screen.getByText('2 deltakere har joinet')).toBeInTheDocument();
  });

  it('viser antall deltakere (entall) for én deltaker', () => {
    const p = [makeParticipant('1', 'Ola')];
    render(<PreStartPanel participants={p} actionLoading={false} onStart={vi.fn()} />);
    expect(screen.getByText('1 deltaker har joinet')).toBeInTheDocument();
  });

  it('filtrerer ut fasilitator fra deltakerlista', () => {
    const p = [
      makeParticipant('1', 'Fasilitator', 'facilitator'),
      makeParticipant('2', 'Ola'),
    ];
    render(<PreStartPanel participants={p} actionLoading={false} onStart={vi.fn()} />);
    expect(screen.queryByText('Fasilitator')).not.toBeInTheDocument();
    expect(screen.getByText('Ola')).toBeInTheDocument();
  });

  it('viser deltakernavn i lista', () => {
    const p = [makeParticipant('1', 'Kari Nordmann'), makeParticipant('2', 'Per Hansen')];
    render(<PreStartPanel participants={p} actionLoading={false} onStart={vi.fn()} />);
    expect(screen.getByText('Kari Nordmann')).toBeInTheDocument();
    expect(screen.getByText('Per Hansen')).toBeInTheDocument();
  });

  it('kaller onStart når knappen klikkes', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<PreStartPanel participants={[]} actionLoading={false} onStart={onStart} />);
    await user.click(screen.getByRole('button', { name: /start sesjon/i }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('deaktiverer "Start sesjon"-knappen når actionLoading er true', () => {
    render(<PreStartPanel participants={[]} actionLoading={true} onStart={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Starter…');
  });

  it('viser "▶ Start sesjon" tekst når ikke loading', () => {
    render(<PreStartPanel participants={[]} actionLoading={false} onStart={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('▶ Start sesjon');
  });
});
