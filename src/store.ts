import type { TokenMap, ChangeLogEntry } from './types';
const TOKEN_MAP_KEY = 'tokenMap';
const CHANGE_LOG_KEY = 'changeLog';
const defaultTokenMap: TokenMap = { organisation_name: 'Default Org', person: 'individual', service_type: 'care service', updatedAt: null };
export const loadTokenMap = (): TokenMap => {
  const saved = localStorage.getItem(TOKEN_MAP_KEY);
  return saved ? JSON.parse(saved) as TokenMap : { ...defaultTokenMap };
};
export const saveTokenMap = (tm: TokenMap) => { localStorage.setItem(TOKEN_MAP_KEY, JSON.stringify(tm)); };
export const loadChangeLog = (): ChangeLogEntry[] => {
  const saved = localStorage.getItem(CHANGE_LOG_KEY);
  return saved ? JSON.parse(saved) as ChangeLogEntry[] : [];
};
export const saveChangeLog = (log: ChangeLogEntry[]) => { localStorage.setItem(CHANGE_LOG_KEY, JSON.stringify(log)); };
