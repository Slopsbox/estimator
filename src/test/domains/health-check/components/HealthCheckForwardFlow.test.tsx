import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { HealthCheckResponseFlow } from '../../../../domains/health-check/components';

beforeEach(() => localStorage.clear());

function answerAll() {
  for (let i = 0; i < 31; i++) {
    const intro = screen.queryByRole('button', { name: 'Start området' });
    if (intro) fireEvent.click(intro);
    expect(screen.queryByRole('button', { name: 'Forrige' })).not.toBeInTheDocument();
    fireEvent.input(screen.getByRole('slider'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: i === 30 ? 'Send svar' : 'Neste' }));
  }
}

it('sender direkte, låser svar ved feil og gjenopptar låst innsending etter reload', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const props = { draftKey: 'forward-flow', submitting: false, submitError: 'Nettverksfeil', onSubmit };
  const { unmount } = render(<HealthCheckResponseFlow {...props} />);
  answerAll();
  await act(async () => {});
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(Object.values(onSubmit.mock.calls[0][0])).toEqual(Array(31).fill(5));
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.queryByText('Se gjennom svarene dine')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Nettverksfeil');
  unmount();
  render(<HealthCheckResponseFlow {...props} />);
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Prøv innsending igjen' })));
  expect(onSubmit).toHaveBeenCalledTimes(2);
  expect(onSubmit.mock.calls[1][0]).toEqual(onSubmit.mock.calls[0][0]);
});

it('blokkerer dobbel innsending mens forespørselen pågår', async () => {
  let resolve!: () => void;
  const onSubmit = vi.fn(() => new Promise<void>(done => { resolve = done; }));
  render(<HealthCheckResponseFlow submitting={false} submitError={null} onSubmit={onSubmit} />);
  answerAll();
  expect(screen.getByRole('button', { name: 'Sender svar…' })).toBeDisabled();
  expect(onSubmit).toHaveBeenCalledOnce();
  await act(async () => resolve());
});
