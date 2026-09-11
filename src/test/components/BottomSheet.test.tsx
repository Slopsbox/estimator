import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomSheet } from '../../components/BottomSheet';

describe('BottomSheet', () => {
  it('rendrer children når isOpen=true', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()}>
        <p>Sheet-innhold</p>
      </BottomSheet>,
    );
    expect(screen.getByText('Sheet-innhold')).toBeInTheDocument();
  });

  it('rendrer ikke dialog eller skjulte kontroller når isOpen=false', () => {
    render(
      <BottomSheet isOpen={false} onClose={vi.fn()}>
        <p>Skjult innhold</p>
      </BottomSheet>,
    );
    expect(screen.queryByText('Skjult innhold')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lukk' })).not.toBeInTheDocument();
  });

  it('har role="dialog" og aria-modal="true"', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()}>
        <p>Test</p>
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Informasjon om estimat');
  });

  it('kaller onClose ved klikk på "Lukk"-knappen', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose}>
        <p>Innhold</p>
      </BottomSheet>,
    );
    await user.click(screen.getByRole('button', { name: 'Lukk' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('kaller onClose ved klikk på overlay (aria-hidden)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet isOpen={true} onClose={onClose}>
        <p>Innhold</p>
      </BottomSheet>,
    );
    // Overlay er div med aria-hidden="true" og onClick
    const overlay = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(overlay).toBeTruthy();
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('kaller onClose ved Escape-tasten', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose}>
        <p>Innhold</p>
      </BottomSheet>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('kaller IKKE onClose ved Escape-tasten når isOpen=false', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={false} onClose={onClose}>
        <p>Innhold</p>
      </BottomSheet>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('viser "Lukk"-knapp', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()}>
        <p>Test</p>
      </BottomSheet>,
    );
    expect(screen.getByRole('button', { name: 'Lukk' })).toBeInTheDocument();
  });

  it('returnerer fokus til elementet som åpnet arket', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(
      <BottomSheet isOpen={true} onClose={vi.fn()}>
        <p>Test</p>
      </BottomSheet>,
    );
    expect(screen.getByRole('button', { name: 'Lukk' })).toHaveFocus();

    rerender(
      <BottomSheet isOpen={false} onClose={vi.fn()}>
        <p>Test</p>
      </BottomSheet>,
    );
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('setter translateY(0) ved isOpen=true', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()}>
        <p>Test</p>
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveStyle({ transform: 'translateY(0)' });
  });
});
