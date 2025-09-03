export type Role = 'admin' | 'user';
export interface User { password: string; role: Role; }

export interface TokenMap {
  organisation_name: string;
  organisation_short: string;   // NEW
  person: string;
  service_type: string;
  updatedAt: string | null;
}

export interface ChangeLogEntry {
  field: keyof TokenMap; oldValue: string | null; newValue: string | null; user: string; timestamp: string;
}

export interface DocumentMeta { title: string; segment: string; policy: string; filename: string; content: string; }
