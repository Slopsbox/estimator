import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SizeSelector } from '../../components/SizeSelector';
import type { Size } from '../../lib/types';

describe('SizeSelector', () => {
  const sizes: Size[] = ['xs', 's', 'm', 'l', 'xl'];

  it('viser alle fem størrelsesknapper', () => {
    render(<SizeSelector selected={null} onChange={() => undefined} />);
    for (const size of sizes) {
      expect(screen.getByRole('button', { name: size.toUpperCase() })).toBeInTheDocument();
    }
  });

  it('markerer valgt størrelse med aria-pressed=true', () => {
    render(<SizeSelector selected="m" onChange={() => undefined} />);
    const mBtn = screen.getByRole('button', { name: 'M' });
    expect(mBtn).toHaveAttribute('aria-pressed', 'true');
    // Andre knapper skal ikke være pressed
    expect(screen.getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('kaller onChange med riktig størrelse ved klikk', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SizeSelector selected={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'L' }));
    expect(onChange).toHaveBeenCalledWith('l');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('knapper er disabled når disabled=true', () => {
    render(<SizeSelector selected={null} onChange={() => undefined} disabled={true} />);
    for (const size of sizes) {
      expect(screen.getByRole('button', { name: size.toUpperCase() })).toBeDisabled();
    }
  });

  it('kaller ikke onChange ved klikk på disabled knapp', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SizeSelector selected={null} onChange={onChange} disabled={true} />);
    await user.click(screen.getByRole('button', { name: 'M' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
