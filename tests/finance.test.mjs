import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, filterEntries, dateRange, previousRange, flowModel, dailySeries, exportCSV } from '../src/finance.js';
import { demoData } from '../src/demo.js';
import { parseCSV, parseDecimal, validateEntry, mergeEntries, replaceSyncedEntries } from '../server/ledger.mjs';
import { normalizeStripe, normalizeMercury, normalizeCloudflare, normalizeGcp, stripe, mercury, cloudflare } from '../server/adapters.mjs';
const entry=(overrides={})=>({id:'a',source:'mercury',date:'2026-09-22',amount:10000,currency:'USD',description:'Invoice',category:'Revenue',kind:'credit',basis:'cash',status:'posted',counterparty:'Client',...overrides});
test('cash totals exclude internal transfers, pending and review entries',()=>{
 const data=[entry(),entry({id:'b',amount:-2500,kind:'debit'}),entry({id:'c',amount:90000,kind:'transfer'}),entry({id:'d',amount:50000,status:'pending'}),entry({id:'e',amount:40000,status:'review'})];
 assert.deepEqual(summarize(data),{credits:10000,debits:2500,net:7500,margin:75,count:2,excluded:3});
});
test('currencies and billing bases never mix',()=>{
 const data=[entry(),entry({currency:'EUR'}),entry({source:'gcp',basis:'accrual',amount:-500,kind:'debit'})];
 assert.equal(filterEntries(data,{start:'2026-09-01',end:'2026-09-30'}).length,1);
 assert.equal(filterEntries(data,{start:'2026-09-01',end:'2026-09-30'},'USD','all','accrual')[0].amount,-500);
});
test('periods cross month and leap-year boundaries in UTC',()=>{
 assert.deepEqual(dateRange('7',new Date('2024-03-02T01:00:00Z')),{start:'2024-02-25',end:'2024-03-02'});
 assert.deepEqual(previousRange({start:'2024-03-01',end:'2024-03-31'}),{start:'2024-01-30',end:'2024-02-29'});
 assert.deepEqual(dateRange('year',new Date('2026-09-22Z')),{start:'2026-01-01',end:'2026-09-22'});
});
test('Sankey conserves value for positive and negative cash flow',()=>{
 for(const debit of [-2500,-15000]){const flow=flowModel([entry(),entry({id:'b',amount:debit,kind:'debit',category:'Cloud'})]);assert.equal(flow.inputs.reduce((s,e)=>s+e.value,0),flow.total);assert.equal(flow.outputs.reduce((s,e)=>s+e.value,0),flow.total);assert.equal(flow.net,10000+debit);}
 assert.equal(flowModel([]).total,0);assert.equal(summarize([]).margin,null);
});
test('zero-activity dates stay present in the timeline',()=>{const d=dailySeries([entry()],{start:'2026-09-21',end:'2026-09-23'});assert.equal(d.length,3);assert.deepEqual(d.map(v=>v.credits),[0,10000,0]);});
test('demo ledger is deterministic and cash totals match daily and Sankey totals',()=>{
 const reference=new Date('2026-09-22Z');assert.deepEqual(demoData(reference),demoData(reference));
 const range=dateRange('30',reference),records=filterEntries(demoData(reference).entries,range);
 const stats=summarize(records),days=dailySeries(records,range),flow=flowModel(records);
 assert.equal(stats.net,days.reduce((s,e)=>s+e.net,0));assert.equal(flow.total,Math.max(stats.credits,stats.debits));
});
test('decimal amounts convert exactly and invalid precision is rejected',()=>{assert.equal(parseDecimal('0.29'),29);assert.equal(parseDecimal('-1234.09'),-123409);assert.throws(()=>parseDecimal('1.001'));assert.throws(()=>parseDecimal('1e4'));assert.throws(()=>parseDecimal('$40'));});
const header='id,source,date,amount,currency,description,category,kind,basis,status,counterparty';
test('CSV handles quoted commas, newlines, BOM, escaped quotes and CRLF',()=>{
 const csv='\uFEFF'+header+'\r\na,cloudflare,2026-09-22,-49.00,USD,"Database, Pro\nplan ""A""",Cloudflare,debit,accrual,posted,Cloudflare\r\n';
 const [e]=parseCSV(csv,'cloudflare');assert.equal(e.amount,-4900);assert.equal(e.description,'Database, Pro\nplan "A"');
});
test('import validates sign, dates, providers, duplicates, currencies and basis',()=>{
 const row='a,cloudflare,2026-09-22,-49.00,USD,Plan,Cloudflare,debit,accrual,posted,Cloudflare';
 for(const bad of [row.replace('2026-09-22','2026-02-30'),row.replace('-49.00','49'),row.replace('USD','JPY'),row.replace('accrual','cash'),row.replace('cloudflare','stripe')])assert.throws(()=>parseCSV(header+'\n'+bad,'cloudflare'));
 assert.throws(()=>parseCSV(header+'\n'+row+'\n'+row,'cloudflare'));assert.throws(()=>parseCSV(header+'\na,"bad','cloudflare'));assert.throws(()=>parseCSV(header,'cloudflare'));
});
test('upserts are idempotent and review decisions persist',()=>{
 const a=entry({status:'review'}),key='mercury:a';let records=mergeEntries([], [a]);records=mergeEntries(records,[a],{[key]:{kind:'transfer',status:'posted'}});assert.equal(records.length,1);assert.equal(records[0].kind,'transfer');assert.equal(records[0].status,'posted');
});
test('CSV export round-trips money and neutralizes formula-like text',()=>{const csv=exportCSV([entry({description:'=WEBSERVICE("test")'})]);const [e]=parseCSV(csv,'mercury');assert.equal(e.amount,10000);assert.ok(e.description.startsWith("'="));});
test('Stripe separates gross and fees, excludes payouts, flags unknown types',()=>{
 const raw={id:'txn_1',amount:10000,fee:320,currency:'usd',created:1790035200,type:'charge'};
 assert.equal(summarize(normalizeStripe(raw)).net,9680);
 assert.equal(normalizeStripe({...raw,type:'payout',amount:-10000,fee:0})[0].kind,'transfer');
 assert.equal(normalizeStripe({...raw,type:'adjustment'})[0].status,'review');
 assert.equal(summarize(normalizeStripe({...raw,type:'refund',amount:-10000,fee:-320})).net,-9680);
});
test('Mercury flags possible settlements instead of pretending they are revenue',()=>{
 const raw={id:'m1',amount:100,status:'sent',postedAt:'2026-09-22',createdAt:'2026-09-21',counterpartyName:'Stripe Inc'};
 assert.equal(normalizeMercury(raw)[0].status,'review');assert.equal(normalizeMercury({...raw,status:'pending'})[0].status,'pending');assert.equal(normalizeMercury({...raw,status:'failed'}).length,0);
 const normal=normalizeMercury({...raw,counterpartyName:'Customer'})[0];assert.equal(normal.amount,10000);assert.equal(normal.status,'posted');assert.equal(normal.date,'2026-09-22');
});
test('Cloudflare normalizes billing signs and flags unknown types',()=>{const raw={id:'cf1',amount:20.99,currency:'USD',occurred_at:'2026-09-22',type:'charge'};assert.equal(normalizeCloudflare(raw).amount,-2099);assert.equal(normalizeCloudflare({...raw,type:'credit'}).amount,2099);assert.equal(normalizeCloudflare({...raw,type:'payment'}).status,'review');});
test('Stripe adapter follows pagination and rejects incomplete data',async()=>{let calls=0;const rows=await stripe({STRIPE_SECRET_KEY:'test'},async url=>{calls++;if(calls===2)assert.ok(url.includes('starting_after=txn_1'));return {data:[{id:`txn_${calls}`,amount:100,fee:0,currency:'usd',created:1790035200,type:'charge'}],has_more:calls===1};});assert.equal(rows.length,2);assert.equal(calls,2);await assert.rejects(stripe({},async()=>({data:[],has_more:true})));});
test('Mercury and Cloudflare adapters validate provider response shapes',async()=>{await assert.rejects(mercury({},async()=>({})));await assert.rejects(cloudflare({},async()=>({})));assert.deepEqual(await mercury({},async()=>({transactions:[]})),[]);assert.deepEqual(await cloudflare({},async()=>({result:[]})),[]);});
test('invalid integer money and untrusted enum values never reach store',()=>{assert.throws(()=>validateEntry(entry({amount:0.1})));assert.throws(()=>validateEntry(entry({status:'complete'})));assert.throws(()=>validateEntry(entry({id:''})));});

test('GCP exposes usage credits separately without counting them as cash',()=>{const rows=normalizeGcp({f:[{v:'2026-09-22'},{v:'USD'},{v:'10000'},{v:'-2500'}]});assert.equal(rows.length,2);assert.equal(rows[0].basis,'accrual');assert.deepEqual(summarize(rows),{credits:2500,debits:10000,net:-7500,margin:-300,count:2,excluded:0});assert.throws(()=>normalizeGcp({f:[{v:'2026-09-22'},{v:'JPY'},{v:'10000'},{v:'-2500'}]}));});

test('rolling sync preserves archived history and imports while replacing the refreshed window',()=>{
 const records=[entry({id:'old',date:'2024-01-01'}),entry({id:'recent',date:'2026-09-21'}),entry({id:'cancelled',date:'2026-09-20'}),entry({id:'csv-only',date:'2026-09-20'}),entry({id:'another',source:'stripe'})];
 const updated=entry({id:'recent',date:'2026-09-21',amount:8000});
 const snapshot=replaceSyncedEntries(records,[updated],'mercury',['old','recent','cancelled'],'2025-09-22');
 assert.deepEqual(new Set(snapshot.entries.map(e=>e.id)),new Set(['old','recent','csv-only','another']));
 assert.equal(snapshot.entries.find(e=>e.id==='recent').amount,8000);
 assert.deepEqual(new Set(snapshot.syncIds),new Set(['old','recent']));
 const emptyRefresh=replaceSyncedEntries(snapshot.entries,[],'mercury',snapshot.syncIds,'2025-09-23');
 assert.ok(emptyRefresh.entries.some(e=>e.id==='old'));assert.ok(!emptyRefresh.entries.some(e=>e.id==='recent'));
});
test('provider records without stable IDs are rejected instead of collapsing onto undefined',()=>{
 assert.throws(()=>normalizeStripe({amount:100,fee:0,currency:'usd',created:1790035200,type:'charge'}));
 assert.throws(()=>normalizeMercury({amount:1,status:'sent',postedAt:'2026-09-22',counterpartyName:'Client'}));
 assert.throws(()=>normalizeCloudflare({amount:1,type:'charge',currency:'USD',occurred_at:'2026-09-22'}));
});
test('GCP null or absent money is not silently treated as zero usage',()=>{
 for(const v of [null,undefined,'','1.1','NaN'])assert.throws(()=>normalizeGcp({f:[{v:'2026-09-22'},{v:'USD'},{v},{v:'0'}]}));
 assert.throws(()=>normalizeGcp({}));
});

test('v1 rejects removed provider imports',()=>{assert.throws(()=>validateEntry(entry({source:'supabase',basis:'accrual'})),/Unknown provider/);});

test('multiple source filters preserve date, currency and basis boundaries',()=>{
 const data=[entry({id:'bank'}),entry({id:'payment',source:'stripe'}),entry({id:'cloud',source:'cloudflare',basis:'accrual'}),entry({id:'old',date:'2026-08-01'}),entry({id:'euro',currency:'EUR'})];
 const range={start:'2026-09-01',end:'2026-09-30'};
 assert.deepEqual(filterEntries(data,range,'USD',['mercury','stripe']).map(e=>e.id),['bank','payment']);
 assert.deepEqual(filterEntries(data,range,'USD',['stripe']).map(e=>e.id),['payment']);
 assert.deepEqual(filterEntries(data,range,'USD',[]),[]);
 assert.deepEqual(filterEntries(data,range,'USD',['cloudflare'],'accrual').map(e=>e.id),['cloud']);
});
