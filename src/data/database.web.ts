import { validatePersistentData } from '../domain/backup';
import { emptyData } from '../domain/defaults';
import { DATA_SCHEMA_VERSION, DEVELOPMENT_PREVIEW_AVAILABLE, type LocalDatabase } from './repository';
import type { PersistentData } from '../domain/types';

const DATA_KEY = 'orbit.local-data.v1';
const MODE_KEY = 'orbit.preview-mode';
let memoryData: PersistentData = emptyData();
let memoryMode = DEVELOPMENT_PREVIEW_AVAILABLE;

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export const database: LocalDatabase = {
  async load() {
    const local = storage();
    if (!local) return { data: memoryData, sampleMode: memoryMode };
    const serialized = local.getItem(DATA_KEY);
    if (!serialized) return { data: emptyData(), sampleMode: DEVELOPMENT_PREVIEW_AVAILABLE && local.getItem(MODE_KEY) !== 'false' };
    let payload: unknown;
    try { payload = JSON.parse(serialized); } catch { throw new Error('Local data could not be read. Export or restore a valid backup before resetting storage.'); }
    if (!payload || typeof payload !== 'object' || !('version' in payload) || payload.version !== DATA_SCHEMA_VERSION || !('data' in payload)) throw new Error('This local database version is not supported.');
    return { data: validatePersistentData(payload.data), sampleMode: DEVELOPMENT_PREVIEW_AVAILABLE && local.getItem(MODE_KEY) !== 'false' };
  },
  async save(data) {
    const validated = validatePersistentData(data);
    const local = storage();
    // One setItem is atomic: validation or quota failures leave the old snapshot intact.
    if (local) local.setItem(DATA_KEY, JSON.stringify({ version: DATA_SCHEMA_VERSION, data: validated }));
    memoryData = validated;
  },
  async setSampleMode(enabled) {
    if (enabled && !DEVELOPMENT_PREVIEW_AVAILABLE) throw new Error('Demo data is available only in development builds.');
    const local = storage();
    if (local) local.setItem(MODE_KEY, String(enabled));
    memoryMode = enabled;
  },
};
