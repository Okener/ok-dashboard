export const providers = [
  { id: 'stripe', name: 'Stripe', color: '#635bff', description: 'Payments & revenue', method: 'Read-only API' },
  { id: 'mercury', name: 'Mercury', color: '#40465c', description: 'Banking & cash', method: 'Read-only API' },
  { id: 'gcp', name: 'Google Cloud', color: '#4285f4', description: 'Cloud infrastructure', method: 'BigQuery billing export' },
  { id: 'cloudflare', name: 'Cloudflare', color: '#f48120', description: 'Network & security', method: 'Billing history API' },
];
export const money = (cents, currency = 'USD', compact = false) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: compact ? 1 : 2, minimumFractionDigits: compact ? 0 : 2, ...(compact ? { notation: 'compact' } : {}) }).format(cents / 100);
export const day = (d) => d.toISOString().slice(0, 10);
export function dateRange(period, reference = new Date()) {
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const start = new Date(end);
  if (period === 'month') start.setUTCDate(1);
  else if (period === 'year') { start.setUTCMonth(0); start.setUTCDate(1); }
  else start.setUTCDate(start.getUTCDate() - Number(period) + 1);
  return { start: day(start), end: day(end) };
}
export function previousRange(range) {
  const duration = Date.parse(range.end) - Date.parse(range.start) + 86400000;
  return { start: day(new Date(Date.parse(range.start) - duration)), end: day(new Date(Date.parse(range.start) - 86400000)) };
}
/** @param {string | string[]} source */
export function filterEntries(entries, range, currency = 'USD', source = 'all', basis = 'cash') {
  return entries.filter(e => e.date >= range.start && e.date <= range.end && e.currency === currency && (source === 'all' || (Array.isArray(source) ? source.includes(e.source) : e.source === source)) && e.basis === basis);
}
export function summarize(entries) {
  const eligible = entries.filter(e => e.status === 'posted' && e.kind !== 'transfer');
  const credits = eligible.reduce((s, e) => s + Math.max(0, e.amount), 0);
  const debits = eligible.reduce((s, e) => s + Math.max(0, -e.amount), 0);
  return { credits, debits, net: credits - debits, margin: credits ? (credits - debits) / credits * 100 : null, count: eligible.length, excluded: entries.length - eligible.length };
}
export function groupAmounts(entries, direction, field = 'category') {
  const result = new Map();
  entries.filter(e => e.status === 'posted' && e.kind !== 'transfer' && (direction === 'credit' ? e.amount > 0 : e.amount < 0)).forEach(e => result.set(e[field], (result.get(e[field]) || 0) + Math.abs(e.amount)));
  return [...result].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
export function dailySeries(entries, range) {
  const days = [];
  for (let d = Date.parse(range.start); d <= Date.parse(range.end); d += 86400000) {
    const date = day(new Date(d));
    days.push({ date, ...summarize(entries.filter(e => e.date === date)) });
  }
  return days;
}
export function flowModel(entries) {
  const { credits, debits, net } = summarize(entries);
  const inputs = groupAmounts(entries, 'credit', 'source').map(e => ({ ...e, name: providers.find(p => p.id === e.name)?.name || e.name }));
  const outputs = groupAmounts(entries, 'debit');
  const billing = entries.length > 0 && entries.every(e => e.basis === 'accrual');
  if (net > 0) outputs.push({ name: billing ? 'Net billing credit' : 'Net retained', value: net });
  if (net < 0) inputs.push({ name: billing ? 'Net billing cost' : 'Funding gap', value: -net });
  return { inputs, outputs, total: Math.max(credits, debits), net };
}
export function exportCSV(entries) {
  const columns = ['id','source','date','amount','currency','description','category','kind','basis','status','counterparty'];
  const escape = (v, numeric = false) => '"' + (numeric ? String(v) : String(v ?? '').replace(/^[=+@\t\r-]/, "'$&")).replace(/"/g, '""') + '"';
  return [columns.join(','), ...entries.map(e => columns.map(k => escape(k === 'amount' ? (e.amount / 100).toFixed(2) : e[k], k === 'amount')).join(','))].join('\r\n');
}
