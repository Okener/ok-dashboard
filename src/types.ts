export type Provider = 'stripe' | 'mercury' | 'gcp' | 'cloudflare';
export type Entry = { id: string; source: Provider; date: string; amount: number; currency: string; description: string; category: string; kind: 'credit' | 'debit' | 'transfer'; basis: 'cash' | 'accrual'; status: 'posted' | 'pending' | 'review'; counterparty: string };
export type Connection = { id: Provider; configured: boolean; method: string; lastSync: string | null; count: number; error: string | null };
export type Dataset = { entries: Entry[]; connections: Connection[]; updatedAt: string | null; mode: 'demo' | 'live' };
