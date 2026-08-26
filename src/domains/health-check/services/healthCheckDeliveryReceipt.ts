import { isRfc3339Timestamp } from './parsers';
import type { FinalizeHealthCheckResult, HealthCheckDownloadStatusResult } from './types';

export const HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY = 'health_check_delivery_receipt_v1';

const UUID_V1_TO_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT_KEYS = ['version', 'roomId', 'jobId', 'expiresAt'] as const;

export interface HealthCheckDeliveryReceipt {
  readonly version: 1;
  readonly roomId: string;
  readonly jobId: string;
  readonly expiresAt: string;
}

export interface HealthCheckDeliveryReceiptStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface HealthCheckDeliveryReceiptStore {
  read(): HealthCheckDeliveryReceipt | null;
  write(receipt: HealthCheckDeliveryReceipt): void;
  clear(): void;
  recordFinalize(roomId: string, result: FinalizeHealthCheckResult): HealthCheckDeliveryReceipt | null;
  refreshStatus(
    roomId: string,
    jobId: string,
    result: HealthCheckDownloadStatusResult,
  ): HealthCheckDeliveryReceipt | null;
}

export function createDeliveryReceipt(
  roomId: string,
  result: FinalizeHealthCheckResult,
): HealthCheckDeliveryReceipt {
  const receipt = { version: 1 as const, roomId, jobId: result.jobId, expiresAt: result.expiresAt };
  if (!isDeliveryReceipt(receipt)) throw new Error('invalid_health_check_delivery_receipt');
  return receipt;
}

export function updateDeliveryReceiptExpiry(
  receipt: HealthCheckDeliveryReceipt,
  roomId: string,
  jobId: string,
  result: HealthCheckDownloadStatusResult,
): HealthCheckDeliveryReceipt {
  if (!isDeliveryReceipt(receipt) || !isRfc3339Timestamp(result.expiresAt)) {
    throw new Error('invalid_health_check_delivery_receipt');
  }
  if (receipt.roomId !== roomId || receipt.jobId !== jobId) {
    throw new Error('health_check_delivery_receipt_context_mismatch');
  }
  return Date.parse(receipt.expiresAt) <= Date.parse(result.expiresAt)
    ? receipt
    : { ...receipt, expiresAt: result.expiresAt };
}

export function createHealthCheckDeliveryReceiptStore({
  storage,
  now = () => new Date(),
}: {
  readonly storage: HealthCheckDeliveryReceiptStoragePort;
  readonly now?: () => Date;
}): HealthCheckDeliveryReceiptStore {
  function clear(): void {
    try {
      storage.removeItem(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY);
    } catch {
      // Receipt persistence is optional; server state remains authoritative.
    }
  }

  function read(): HealthCheckDeliveryReceipt | null {
    try {
      const serialized = storage.getItem(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY);
      if (serialized === null) return null;
      const value: unknown = JSON.parse(serialized);
      if (!isDeliveryReceipt(value) || Date.parse(value.expiresAt) <= now().getTime()) {
        clear();
        return null;
      }
      return value;
    } catch {
      clear();
      return null;
    }
  }

  function write(receipt: HealthCheckDeliveryReceipt): void {
    if (!isDeliveryReceipt(receipt) || Date.parse(receipt.expiresAt) <= now().getTime()) {
      throw new Error('invalid_health_check_delivery_receipt');
    }
    const serialized = JSON.stringify({
      version: 1,
      roomId: receipt.roomId,
      jobId: receipt.jobId,
      expiresAt: receipt.expiresAt,
    });
    try {
      storage.setItem(HEALTH_CHECK_DELIVERY_RECEIPT_STORAGE_KEY, serialized);
    } catch {
      // Receipt persistence is optional; callers can continue with the server result.
    }
  }

  return {
    read,
    write,
    clear,
    recordFinalize(roomId, result) {
      const candidate = createDeliveryReceipt(roomId, result);
      const existing = read();
      const receipt = existing?.roomId === roomId && existing.jobId === result.jobId
        && Date.parse(existing.expiresAt) <= Date.parse(candidate.expiresAt)
        ? existing
        : candidate;
      if (Date.parse(receipt.expiresAt) <= now().getTime()) {
        clear();
        return null;
      }
      write(receipt);
      return receipt;
    },
    refreshStatus(roomId, jobId, result) {
      const receipt = read();
      if (!receipt) return null;
      const updated = updateDeliveryReceiptExpiry(receipt, roomId, jobId, result);
      if (Date.parse(updated.expiresAt) <= now().getTime()) {
        clear();
        return null;
      }
      write(updated);
      return updated;
    },
  };
}

export function createBrowserHealthCheckDeliveryReceiptStore(): HealthCheckDeliveryReceiptStore {
  return createHealthCheckDeliveryReceiptStore({
    storage: {
      getItem(key) {
        return globalThis.localStorage.getItem(key);
      },
      setItem(key, value) {
        globalThis.localStorage.setItem(key, value);
      },
      removeItem(key) {
        globalThis.localStorage.removeItem(key);
      },
    },
  });
}

function isDeliveryReceipt(value: unknown): value is HealthCheckDeliveryReceipt {
  if (!isPlainRecord(value)) return false;
  const keys = ownDataKeys(value);
  if (!keys) return false;
  const version = dataValue(value, 'version');
  const roomId = dataValue(value, 'roomId');
  const jobId = dataValue(value, 'jobId');
  const expiresAt = dataValue(value, 'expiresAt');
  return keys.length === RECEIPT_KEYS.length
    && RECEIPT_KEYS.every((key) => keys.includes(key))
    && version === 1
    && typeof roomId === 'string'
    && UUID_V1_TO_V5_PATTERN.test(roomId)
    && typeof jobId === 'string'
    && UUID_V1_TO_V5_PATTERN.test(jobId)
    && isRfc3339Timestamp(expiresAt);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function ownDataKeys(record: Record<string, unknown>): string[] | null {
  try {
    const keys = Reflect.ownKeys(record);
    if (keys.some((key) => typeof key !== 'string')) return null;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    }
    return keys as string[];
  } catch {
    return null;
  }
}

function dataValue(record: Record<string, unknown>, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}
