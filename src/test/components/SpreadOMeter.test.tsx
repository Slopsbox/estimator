import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpreadOMeter } from '../../components/SpreadOMeter';
import {
  calculateDisagreement,
  calculateRange,
  calculateValueRange,
  requiresReestimation,
} from '../../lib/spreadOMeter';
import type { Size, Value } from '../../lib/types';

const vote = (size: Size, value: Value = 'silver') => ({ size, value });

describe('calculateRange', () => {
  it('returnerer 0 for tom stemmeliste', () => {
    expect(calculateRange([])).toBe(0);
  });

  it('beregner avstanden mellom laveste og høyeste størrelse', () => {
    expect(calculateRange([vote('m'), vote('xs'), vote('xl'), vote('s')])).toBe(4);
  });
});

describe('calculateValueRange', () => {
  it('returnerer 0 når alle vurderer verdien likt', () => {
    expect(calculateValueRange([vote('m', 'silver'), vote('l', 'silver')])).toBe(0);
  });

  it('beregner avstanden fra Bronse til Gull som 2', () => {
    expect(calculateValueRange([vote('m', 'bronze'), vote('m', 'gold')])).toBe(2);
  });
});

describe('calculateDisagreement', () => {
  it('krever ny estimering ved minst to størrelsestrinn', () => {
    expect(calculateDisagreement([vote('s'), vote('l')])).toMatchObject({
      sizeRange: 2,
      valueRange: 0,
      requiresReestimation: true,
    });
  });

  it('krever ny estimering ved Bronse mot Gull', () => {
    expect(calculateDisagreement([vote('m', 'bronze'), vote('m', 'gold')])).toMatchObject({
      sizeRange: 0,
      valueRange: 2,
      requiresReestimation: true,
    });
  });

  it('krever ikke ny estimering ved ett trinn på begge skalaer', () => {
    expect(requiresReestimation([vote('m', 'silver'), vote('l', 'gold')])).toBe(false);
  });
});

describe('SpreadOMeter', () => {
  it('viser ingenting for tom stemmeliste eller full enighet', () => {
    const empty = render(<SpreadOMeter votes={[]} />);
    expect(empty.container.firstChild).toBeNull();
    empty.unmount();

    const agreement = render(
      <SpreadOMeter votes={[vote('m', 'silver'), vote('m', 'silver')]} />,
    );
    expect(agreement.container.firstChild).toBeNull();
  });

  it('viser en lett melding ved liten forskjell', () => {
    render(<SpreadOMeter votes={[vote('m', 'silver'), vote('l', 'silver')]} />);

    expect(screen.getByText('Nesten samme risikovurdering')).toBeInTheDocument();
    expect(screen.getByText('En rask avklaring bør være nok.')).toBeInTheDocument();
  });

  it('viser tydelig beskjed ved stor størrelsesforskjell', () => {
    render(<SpreadOMeter votes={[vote('s', 'silver'), vote('l', 'silver')]} />);

    expect(screen.getByText('Ulik risikovurdering!')).toBeInTheDocument();
    expect(screen.getByText('Denne må vi snakke om og estimere på nytt.')).toBeInTheDocument();
    expect(screen.getByText('Estimer på nytt')).toBeInTheDocument();
  });

  it('viser tydelig beskjed ved stor verdiforskjell', () => {
    render(<SpreadOMeter votes={[vote('m', 'bronze'), vote('m', 'gold')]} />);

    expect(screen.getByText('Ulik risikovurdering!')).toBeInTheDocument();
  });

  it('viser stemmefordeling for størrelse og verdi', () => {
    render(
      <SpreadOMeter
        votes={[vote('s', 'bronze'), vote('l', 'gold'), vote('l', 'gold')]}
      />,
    );

    expect(screen.getByLabelText('S: 1 stemme')).toBeInTheDocument();
    expect(screen.getByLabelText('L: 2 stemmer')).toBeInTheDocument();
    expect(screen.getByLabelText('Bronse: 1 stemme')).toBeInTheDocument();
    expect(screen.getByLabelText('Gull: 2 stemmer')).toBeInTheDocument();
  });

  it('har tilgjengelig regionnavn', () => {
    render(<SpreadOMeter votes={[vote('m', 'silver'), vote('xl', 'silver')]} />);
    expect(screen.getByRole('region', { name: /teamets risikovurdering/i })).toBeInTheDocument();
  });
});
