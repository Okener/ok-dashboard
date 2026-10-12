import { providers } from '../src/finance.js';
export const supportedCurrencies = new Set(['USD','EUR','GBP','CAD','AUD','CHF','SGD','NZD']);
export class UserError extends Error {}
export function validateEntry(e) {
  if (!e || !providers.some(p=>p.id===e.source)) throw new UserError('Unknown provider.');
  if (typeof e.id!=='string'||!e.id.trim()||e.id.length>200) throw new UserError('Every record needs a stable ID (maximum 200 characters).');
  if (typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||Number.isNaN(Date.parse(e.date))||new Date(e.date).toISOString().slice(0,10)!==e.date) throw new UserError(`Invalid date for ${e.id}. Use YYYY-MM-DD.`);
  if (!Number.isSafeInteger(e.amount)||Math.abs(e.amount)>1e12) throw new UserError(`Invalid amount for ${e.id}.`);
  if (!supportedCurrencies.has(e.currency)) throw new UserError(`Unsupported currency ${e.currency}; currencies are never silently converted.`);
  if (!['credit','debit','transfer'].includes(e.kind)||!['cash','accrual'].includes(e.basis)||!['posted','pending','review'].includes(e.status)) throw new UserError(`Invalid kind, basis, or status for ${e.id}.`);
  if ((e.kind==='credit'&&e.amount<0)||(e.kind==='debit'&&e.amount>0)) throw new UserError(`Amount sign does not match kind for ${e.id}.`);
  const expectedBasis=['stripe','mercury'].includes(e.source)?'cash':'accrual';
  if(e.basis!==expectedBasis)throw new UserError(`${e.source} records belong in ${expectedBasis}. Bank payments and cloud bills must remain separate.`);
  for (const field of ['description','category','counterparty']) if(typeof e[field]!=='string'||e[field].length>500||!e[field].trim())throw new UserError(`Missing or overlong ${field} for ${e.id}.`);
  return Object.fromEntries(['id','source','date','amount','currency','description','category','kind','basis','status','counterparty'].map(k=>[k,e[k]]));
}
export function parseDecimal(value) {
  const v=String(value).trim();
  if(!/^-?\d+(\.\d{1,2})?$/.test(v))throw new UserError(`Invalid amount '${v.slice(0,30)}'. Use a signed decimal with at most 2 decimal places, without currency symbols.`);
  const [whole,fraction='']=v.replace('-','').split('.');
  const amount=(Number(whole)*100+Number(fraction.padEnd(2,'0')))*(v.startsWith('-')?-1:1);
  if(!Number.isSafeInteger(amount))throw new UserError('Amount exceeds supported precision.');
  return amount;
}
export function parseCSV(csv, source) {
  if(typeof csv!=='string'||Buffer.byteLength(csv)>2_000_000)throw new UserError('CSV must be under 2 MB.');
  const rows=[];let row=[],field='',quoted=false,closed=false;
  csv=csv.replace(/^\uFEFF/,'');
  for(let i=0;i<csv.length;i++){
    const ch=csv[i];
    if(quoted){if(ch==='"'){if(csv[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=ch;}
    else if(ch==='"'){if(field||closed)throw new UserError('Malformed CSV quotes.');quoted=true;}
    else if(ch===','||ch==='\n'||ch==='\r'){
      row.push(field);field='';closed=false;
      if(ch!==','){if(ch==='\r'&&csv[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];}
    } else {if(closed)throw new UserError('Unexpected character after closing quote.');field+=ch;}
  }
  if(quoted)throw new UserError('Unclosed CSV quote.');
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  const header=rows.shift()?.map(v=>v.trim());
  const required=['id','date','amount','currency','description','category','kind','basis','status','counterparty'];
  if(!header||required.some(k=>!header.includes(k))||new Set(header).size!==header.length)throw new UserError('Invalid columns. Download the template to see the required CSV format.');
  if(!rows.length)throw new UserError('CSV contains no records.');
  if(rows.length>10000)throw new UserError('Import at most 10,000 records at a time.');
  const ids=new Set();
  return rows.map((values,i)=>{
    if(values.length!==header.length)throw new UserError(`Row ${i+2} has the wrong number of columns.`);
    const e=Object.fromEntries(header.map((k,j)=>[k,values[j].trim()]));
    if(e.source&&e.source!==source)throw new UserError(`Row ${i+2} is for ${e.source}, not ${source}.`);
    const normalized=validateEntry({...e,source,currency:e.currency.toUpperCase(),amount:parseDecimal(e.amount)});
    if(ids.has(normalized.id))throw new UserError(`Duplicate ID '${normalized.id}' in this CSV.`);ids.add(normalized.id);
    return normalized;
  });
}
export function mergeEntries(existing,incoming,overrides={}) {
  const map=new Map(existing.map(e=>[`${e.source}:${e.id}`,e]));
  for(const entry of incoming){const e=validateEntry(entry),key=`${e.source}:${e.id}`;map.set(key,validateEntry({...e,...(e.status!=='pending'?overrides[key]:{})}));}
  return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}

// Refresh only the provider-owned part of the queried window. Older history and
// independent CSV imports stay available for historical executive reporting.
export function replaceSyncedEntries(existing, incoming, source, previousSyncIds, coverageStart, overrides = {}) {
  const owned = new Set(previousSyncIds);
  const retained = existing.filter(e => e.source !== source || !owned.has(e.id) || e.date < coverageStart);
  const entries = mergeEntries(retained, incoming, overrides);
  const archivedIds = retained.filter(e => e.source === source && owned.has(e.id)).map(e => e.id);
  return { entries, syncIds: [...new Set([...archivedIds, ...incoming.map(e => e.id)])] };
}
