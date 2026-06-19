import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ValueSelector } from '../../components/ValueSelector';
import type { Value } from '../../lib/types';

describe('ValueSelector', () => {
  it('viser alle tre verdivalg', () => {
    render(<ValueSelector selected={null} onChange={() => undefined} />);
    expect(screen.getByText('Gull')).toBeInTheDocument();
    expect(screen.getByText('Sølv')).toBeInTheDocument();
    expect(screen.getByText('Bronse')).toBeInTheDocument();
  });

  it('markerer valgt verdi med aria-pressed=true', () => {
    render(<ValueSelector selected="gold" onChange={() => undefined} />);
    const goldBtn = screen.getByRole('button', { name: /gull/i });
    expect(goldBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /sølv/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('kaller onChange med riktig verdi ved klikk', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: Value) => void>();
    render(<ValueSelector selected={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /sølv/i }));
    expect(onChange).toHaveBeenCalledWith('silver');
  });

  it('knapper er disabled når disabled=true', () => {
    render(<ValueSelector selected={null} onChange={() => undefined} disabled={true} />);
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });
});
