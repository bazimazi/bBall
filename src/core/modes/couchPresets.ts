import type { MatchOptions } from './types';
import { couchOptions } from './couch';
import { loadRecord, saveRecord, type StoreSpec } from '../storage/localStore';
const SPEC: StoreSpec<MatchOptions[]> = {
  key: 'bball.couch-presets',
  version: 1,
  create: () => [],
  migrate: (data) => data,
  validate: (data) => (Array.isArray(data) ? data.slice(0, 4).map(couchOptions) : null)
};
export const loadCouchPresets = () => loadRecord(SPEC).value;
export const saveCouchPresets = (presets: MatchOptions[]) => saveRecord(SPEC, presets);
