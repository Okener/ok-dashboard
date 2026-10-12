import { day, providers } from './finance.js';
export function demoData(reference = new Date()) {
  const entries = [];
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const add = (date, source, amount, description, category, extra = {}) => entries.push({ id: `demo-${entries.length}`, source, date, amount, currency: 'USD', description, category, kind: amount >= 0 ? 'credit' : 'debit', basis: 'cash', status: 'posted', counterparty: description, ...extra });
  for (let i = 364; i >= 0; i--) {
    const date = day(new Date(end.getTime() - i * 86400000));
    const d = new Date(date), n = 364 - i;
    const revenue = Math.round((1450 + n * 4.2 + Math.sin(n * 1.9) * 450 + Math.cos(n * .32) * 400) * 100);
    add(date, 'stripe', revenue, ['Subscription payments','Customer payments','Annual subscriptions'][n % 3], 'Revenue');
    add(date, 'stripe', -Math.round(revenue * .029 + 750), 'Payment processing', 'Processing fees');
    if (d.getUTCDay() === 2) {
      add(date, 'mercury', 145000, 'Acme Studio · bank transfer', 'Revenue');
      add(date, 'stripe', -870000, 'Payout to Mercury', 'Internal transfer', { kind: 'transfer' });
      add(date, 'mercury', 870000, 'Stripe payout received', 'Internal transfer', { kind: 'transfer' });
    }
    if ([1, 15].includes(d.getUTCDate())) add(date, 'mercury', -825000, 'Team payroll', 'People');
    if (d.getUTCDate() === 8) add(date, 'mercury', -Math.round((2350 + n * 2) * 100), 'Google Cloud · monthly invoice', 'Google Cloud');
    if (d.getUTCDate() === 12) add(date, 'mercury', -64900, 'Supabase · monthly invoice', 'Supabase');
    if (d.getUTCDate() === 18) add(date, 'mercury', -28900, 'Cloudflare · monthly invoice', 'Cloudflare');
    if (d.getUTCDate() === 5) add(date, 'mercury', -178000, 'Workspace & software', 'Operations');
    if (d.getUTCDay() === 4) add(date, 'mercury', -75000, 'Growth & acquisition', 'Marketing');
    if (n % 13 === 0) add(date, 'stripe', -14900, 'Customer refund', 'Refunds');
    const cloudCost = Math.round((90 + n * .055 + Math.sin(n) * 10) * 100);
    add(date, 'gcp', -cloudCost, 'Daily cloud usage', 'Google Cloud', { basis: 'accrual' });
    add(date, 'gcp', Math.round(cloudCost * .12), 'Cloud usage credits', 'Google Cloud', { basis: 'accrual' });
    if (d.getUTCDate() === 18) add(date, 'cloudflare', -28900, 'Workers, R2 & Pro plan', 'Cloudflare', { basis: 'accrual' });
  }
  add(day(end), 'mercury', -42600, 'Software subscription · pending', 'Operations', { status: 'pending' });
  return { entries, connections: providers.map(p => ({ id: p.id, configured: false, method: p.method, lastSync: null, count: 0, error: null })), updatedAt: null, mode: 'demo' };
}
