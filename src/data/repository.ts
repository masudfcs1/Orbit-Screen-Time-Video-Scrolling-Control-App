import type { PersistentData, StoredData } from '../domain/types';

export interface LocalDatabase {
  load(): Promise<StoredData>;
  /** The complete snapshot is committed atomically or the old snapshot survives. */
  save(data: PersistentData): Promise<void>;
  setSampleMode(enabled: boolean): Promise<void>;
}

export const DATA_SCHEMA_VERSION = 1;

/** Metro replaces __DEV__ at bundle time; production never hydrates demo records. */
export const DEVELOPMENT_PREVIEW_AVAILABLE = typeof __DEV__ !== 'undefined' && __DEV__;
