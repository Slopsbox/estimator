import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY,
  createDeliveryReceipt,
  createBrowserHealthCheckDeliveryReceiptStore,
  createHealthCheckDeliveryReceiptStore,
  updateDeliveryReceiptExpiry,
  type HealthCheckDeliveryReceiptStoragePort,
} from '../../../../domains/health-check/services/healthCheckDeliveryReceipt';

const ROOM_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ROOM_ID = '40000000-0000-4000-8000-000000000004';
const JOB_ID = '20000000-0000-4000-8000-000000000002';
const OTHER_JOB_ID = '30000000-0000-4000-8000-000000000003';
const NOW = new Date('2026-08-26T12:00:00Z');
const SOURCE_EXPIRY = '2026-08-26T13:00:00+00:00';
const READY_EXPIRY = '2026-08-26T12:15:00Z';

function createStorage(values = new Map<string, string>()): HealthCheckDeliveryReceiptStoragePort & {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
} {
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
}

describe('health-check delivery receipt', () => {
  let storage: ReturnType<typeof createStorage>;
  let receipts: ReturnType<typeof createHealthCheckDeliveryReceiptStore>;

  beforeEach(() => {
    storage = createStorage();
    receipts = createHealthCheckDeliveryReceiptStore({ storage, now: () => NOW });
  });

  it('roundtrips only operational metadata through its separate key', () => {
    const receipt = createDeliveryReceipt(ROOM_ID, {
      status: 'download_pending',
      jobId: JOB_ID,
      jobStatus: 'awaiting_materialization',
      expiresAt: SOURCE_EXPIRY,
    });

    receipts.write(receipt);

    expect(receipts.read()).toEqual(receipt);
    expect(storage.setItem).toHaveBeenCalledWith(
      HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY,
      JSON.stringify({ version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: SOURCE_EXPIRY }),
    );
    expect(storage.setItem.mock.calls[0]?.[1]).not.toMatch(/user|name|squad|filename|status|result/i);
  });

  it.each([
    '{',
    'null',
    JSON.stringify({ version: 1, roomId: ROOM_ID, jobId: JOB_ID }),
    JSON.stringify({ version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: SOURCE_EXPIRY, status: 'ready' }),
    JSON.stringify({ version: 2, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: SOURCE_EXPIRY }),
    JSON.stringify({ version: 1, roomId: 'not-a-uuid', jobId: JOB_ID, expiresAt: SOURCE_EXPIRY }),
    JSON.stringify({ version: 1, roomId: ROOM_ID, jobId: '20000000-0000-0000-8000-000000000002', expiresAt: SOURCE_EXPIRY }),
    JSON.stringify({ version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: '2026-08-26T13:00:00' }),
  ])('removes malformed persisted data %#', (serialized) => {
    storage.setItem(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY, serialized);
    storage.removeItem.mockClear();

    expect(receipts.read()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY);
  });

  it('removes a receipt at its exact expiry', () => {
    storage.setItem(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY, JSON.stringify({
      version: 1,
      roomId: ROOM_ID,
      jobId: JOB_ID,
      expiresAt: NOW.toISOString(),
    }));
    storage.removeItem.mockClear();

    expect(receipts.read()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledOnce();
  });

  it.each([
    { version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: NOW.toISOString() },
    { version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: 'invalid' },
    { version: 1, roomId: ROOM_ID, jobId: 'invalid', expiresAt: SOURCE_EXPIRY },
  ])('rejects invalid writes %#', (receipt) => {
    expect(() => receipts.write(receipt as never)).toThrow('invalid_health_check_delivery_receipt');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('rejects accessor and symbol fields without invoking getters', () => {
    let getterRan = false;
    const accessorReceipt = { version: 1, roomId: ROOM_ID, jobId: JOB_ID };
    Object.defineProperty(accessorReceipt, 'expiresAt', {
      enumerable: true,
      get() {
        getterRan = true;
        return SOURCE_EXPIRY;
      },
    });
    expect(() => receipts.write(accessorReceipt as never)).toThrow(
      'invalid_health_check_delivery_receipt',
    );
    expect(getterRan).toBe(false);

    const symbolReceipt = {
      version: 1,
      roomId: ROOM_ID,
      jobId: JOB_ID,
      expiresAt: SOURCE_EXPIRY,
      [Symbol('report')]: 'hidden',
    };
    expect(() => receipts.write(symbolReceipt as never)).toThrow(
      'invalid_health_check_delivery_receipt',
    );
  });

  it('records finalize and shortens expiry from a ready status for the same job', () => {
    expect(receipts.recordFinalize(ROOM_ID, {
      status: 'download_pending',
      jobId: JOB_ID,
      jobStatus: 'awaiting_materialization',
      expiresAt: SOURCE_EXPIRY,
    })).toEqual({ version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: SOURCE_EXPIRY });

    expect(receipts.refreshStatus(ROOM_ID, JOB_ID, {
      status: 'ready',
      filename: 'health-check.zip',
      expiresAt: READY_EXPIRY,
    })).toEqual({ version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: READY_EXPIRY });
    expect(receipts.read()?.expiresAt).toBe(READY_EXPIRY);
  });

  it('does not extend a shortened receipt when finalize is retried with a stale expiry', () => {
    receipts.write({ version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: READY_EXPIRY });

    expect(receipts.recordFinalize(ROOM_ID, {
      status: 'download_pending',
      jobId: JOB_ID,
      jobStatus: 'awaiting_materialization',
      expiresAt: SOURCE_EXPIRY,
    })).toEqual({ version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: READY_EXPIRY });
    expect(receipts.read()?.expiresAt).toBe(READY_EXPIRY);
  });

  it('clears and returns null for an already expired finalize result', () => {
    storage.removeItem.mockClear();

    expect(receipts.recordFinalize(ROOM_ID, {
      status: 'download_pending',
      jobId: JOB_ID,
      jobStatus: 'expired',
      expiresAt: '2026-08-26T11:59:59Z',
    })).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).toHaveBeenCalledWith(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY);
  });

  it('never extends a shortened expiry when a stale status arrives later', () => {
    const receipt = createDeliveryReceipt(ROOM_ID, {
      status: 'download_pending',
      jobId: JOB_ID,
      jobStatus: 'awaiting_materialization',
      expiresAt: SOURCE_EXPIRY,
    });
    const shortened = updateDeliveryReceiptExpiry(receipt, ROOM_ID, JOB_ID, {
      status: 'ready',
      filename: 'health-check.zip',
      expiresAt: READY_EXPIRY,
    });

    expect(updateDeliveryReceiptExpiry(shortened, ROOM_ID, JOB_ID, {
      status: 'awaiting_materialization',
      filename: null,
      expiresAt: SOURCE_EXPIRY,
    })).toEqual(shortened);
  });

  it('retains the existing exact RFC3339 string when expiries are equal', () => {
    const receipt = {
      version: 1 as const,
      roomId: ROOM_ID,
      jobId: JOB_ID,
      expiresAt: '2026-08-26T12:15:00+00:00',
    };

    expect(updateDeliveryReceiptExpiry(receipt, ROOM_ID, JOB_ID, {
      status: 'ready',
      filename: 'health-check.zip',
      expiresAt: READY_EXPIRY,
    })).toBe(receipt);
  });

  it.each([
    [
      { version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: 'invalid' },
      { status: 'ready', filename: 'health-check.zip', expiresAt: READY_EXPIRY },
    ],
    [
      { version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: SOURCE_EXPIRY },
      { status: 'ready', filename: 'health-check.zip', expiresAt: 'invalid' },
    ],
  ])('validates both expiry inputs before comparing them %#', (receipt, result) => {
    expect(() => updateDeliveryReceiptExpiry(
      receipt as never,
      ROOM_ID,
      JOB_ID,
      result as never,
    )).toThrow('invalid_health_check_delivery_receipt');
  });

  it('keeps the shorter expiry across stores sharing browser storage', () => {
    const values = new Map<string, string>();
    const firstTab = createHealthCheckDeliveryReceiptStore({
      storage: createStorage(values),
      now: () => NOW,
    });
    const secondTab = createHealthCheckDeliveryReceiptStore({
      storage: createStorage(values),
      now: () => NOW,
    });
    firstTab.recordFinalize(ROOM_ID, {
      status: 'download_pending',
      jobId: JOB_ID,
      jobStatus: 'awaiting_materialization',
      expiresAt: SOURCE_EXPIRY,
    });
    firstTab.refreshStatus(ROOM_ID, JOB_ID, {
      status: 'ready',
      filename: 'health-check.zip',
      expiresAt: READY_EXPIRY,
    });

    expect(secondTab.refreshStatus(ROOM_ID, JOB_ID, {
      status: 'awaiting_materialization',
      filename: null,
      expiresAt: SOURCE_EXPIRY,
    })?.expiresAt).toBe(READY_EXPIRY);
    expect(firstTab.read()?.expiresAt).toBe(READY_EXPIRY);
  });

  it.each([
    [OTHER_ROOM_ID, JOB_ID],
    [ROOM_ID, OTHER_JOB_ID],
  ])('rejects receipt context mismatch for room %s and job %s', (roomId, jobId) => {
    const receipt = { version: 1 as const, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: SOURCE_EXPIRY };
    receipts.write(receipt);
    storage.setItem.mockClear();

    expect(() => updateDeliveryReceiptExpiry(receipt, roomId, jobId, {
      status: 'ready',
      filename: 'health-check.zip',
      expiresAt: READY_EXPIRY,
    })).toThrow('health_check_delivery_receipt_context_mismatch');
    expect(() => receipts.refreshStatus(roomId, jobId, {
      status: 'ready',
      filename: 'health-check.zip',
      expiresAt: READY_EXPIRY,
    })).toThrow('health_check_delivery_receipt_context_mismatch');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('clears instead of retaining an expired status receipt', () => {
    receipts.recordFinalize(ROOM_ID, {
      status: 'download_pending',
      jobId: JOB_ID,
      jobStatus: 'ready',
      expiresAt: SOURCE_EXPIRY,
    });
    storage.removeItem.mockClear();

    expect(receipts.refreshStatus(ROOM_ID, JOB_ID, {
      status: 'expired',
      filename: null,
      expiresAt: '2026-08-26T11:59:59Z',
    })).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY);
  });

  it('clear removes only the receipt key', () => {
    receipts.clear();

    expect(storage.removeItem).toHaveBeenCalledWith(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY);
  });

  it('returns null when storage reads are unavailable', () => {
    storage.getItem.mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(receipts.read()).toBeNull();
  });

  it('returns null when malformed-data cleanup also fails', () => {
    storage.setItem(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY, '{');
    storage.removeItem.mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(receipts.read()).toBeNull();
  });

  it('returns a finalize receipt when storage quota is exceeded', () => {
    storage.setItem.mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });

    expect(receipts.recordFinalize(ROOM_ID, {
      status: 'download_pending',
      jobId: JOB_ID,
      jobStatus: 'awaiting_materialization',
      expiresAt: SOURCE_EXPIRY,
    })).toEqual({ version: 1, roomId: ROOM_ID, jobId: JOB_ID, expiresAt: SOURCE_EXPIRY });
    expect(() => receipts.write({
      version: 1,
      roomId: ROOM_ID,
      jobId: JOB_ID,
      expiresAt: SOURCE_EXPIRY,
    })).not.toThrow();
  });

  it('returns a refreshed receipt when persisting it fails', () => {
    receipts.recordFinalize(ROOM_ID, {
      status: 'download_pending',
      jobId: JOB_ID,
      jobStatus: 'awaiting_materialization',
      expiresAt: SOURCE_EXPIRY,
    });
    storage.setItem.mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });

    expect(receipts.refreshStatus(ROOM_ID, JOB_ID, {
      status: 'ready',
      filename: 'health-check.zip',
      expiresAt: READY_EXPIRY,
    })?.expiresAt).toBe(READY_EXPIRY);
  });

  it('does not throw when clear fails', () => {
    storage.removeItem.mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(() => receipts.clear()).not.toThrow();
  });

  it('browser receipt clear leaves the separate session pointer untouched', () => {
    localStorage.clear();
    localStorage.setItem('estimat_local_participant', 'session-pointer');

    createBrowserHealthCheckDeliveryReceiptStore().clear();

    expect(localStorage.getItem('estimat_local_participant')).toBe('session-pointer');
    expect(localStorage.getItem(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY)).toBeNull();
  });

  it('browser store fails closed when resolving localStorage throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });

    try {
      const browserStore = createBrowserHealthCheckDeliveryReceiptStore();
      expect(browserStore.read()).toBeNull();
      expect(() => browserStore.clear()).not.toThrow();
      expect(() => browserStore.recordFinalize(ROOM_ID, {
        status: 'download_pending',
        jobId: JOB_ID,
        jobStatus: 'awaiting_materialization',
        expiresAt: SOURCE_EXPIRY,
      })).not.toThrow();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    }
  });
});
