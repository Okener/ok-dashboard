import { GoogleAuth } from 'google-auth-library';
import { UserError, parseDecimal, validateEntry } from './ledger.mjs';
const startDate=()=>new Date(Date.now()-365*86400000).toISOString().slice(0,10);
const epochStart=()=>Math.floor(Date.parse(startDate())/1000);
export function configuration(env=process.env){return {stripe:!!env.STRIPE_SECRET_KEY,mercury:!!env.MERCURY_API_TOKEN,gcp:!!(env.GCP_BILLING_PROJECT&&env.GCP_BILLING_TABLE),cloudflare:!!env.CLOUDFLARE_API_TOKEN};}
async function request(url, token, options={}) {
  let response;
  try{response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(30000)});}catch{throw new UserError('Provider request timed out or could not connect. Previous data is preserved.');}
  if(!response.ok)throw new UserError(`Provider returned HTTP ${response.status}. Check credentials, read permissions, and rate limits. Previous data is preserved.`);
  const data=await response.json();
  if(data.success===false)throw new UserError('Provider rejected the request. Check billing read permissions.');
  return data;
}
function base(source,t){if(typeof t.id!=='string'||!t.id.trim())throw new UserError('Provider returned a record without a stable ID; no partial data was saved.');return {id:t.id,source,date:new Date(t.date).toISOString().slice(0,10),amount:t.amount,currency:(t.currency||'').toUpperCase(),description:t.description||'Provider transaction',category:t.category||'Uncategorized',kind:t.amount>=0?'credit':'debit',basis:['stripe','mercury'].includes(source)?'cash':'accrual',status:'posted',counterparty:t.counterparty||t.description||source};}
export function normalizeStripe(t){
  if(!Number.isSafeInteger(t.amount)||!Number.isSafeInteger(t.fee))throw new UserError('Stripe returned an invalid monetary value.');
  const transfer=['payout','payout_cancel','payout_failure'].includes(t.type);
  const known=['charge','payment','refund','payment_refund','stripe_fee','stripe_fx_fee','payout','payout_cancel','payout_failure'].includes(t.type);
  const e={...base('stripe',{...t,date:t.created*1000}),kind:transfer?'transfer':t.amount>=0?'credit':'debit',category:transfer?'Internal transfer':t.type.includes('refund')?'Refunds':t.type.includes('fee')?'Processing fees':t.amount>0?'Revenue':'Other outflows',status:known?'posted':'review'};
  const entries=[validateEntry(e)];
  if(t.fee)entries.push(validateEntry({...e,id:`${t.id}:fee`,amount:-t.fee,kind:t.fee>0?'debit':'credit',category:'Processing fees',description:`Processing fee · ${t.description||t.id}`}));
  return entries;
}
export async function stripe(env=process.env,fetcher=request){
  const entries=[];let cursor;
  for(let page=0;page<500;page++){
    const query=new URLSearchParams({limit:'100','created[gte]':String(epochStart()),...(cursor?{starting_after:cursor}:{})});
    const data=await fetcher(`https://api.stripe.com/v1/balance_transactions?${query}`,env.STRIPE_SECRET_KEY);
    if(!Array.isArray(data.data)||typeof data.has_more!=='boolean')throw new UserError('Unexpected Stripe response.');
    entries.push(...data.data.flatMap(normalizeStripe));
    if(!data.has_more)return entries;
    const next=data.data.at(-1)?.id;if(!next||next===cursor)throw new UserError('Stripe pagination did not advance.');cursor=next;
  }throw new UserError('Stripe sync exceeded 50,000 records; no partial data was saved.');
}
export function normalizeMercury(t){
  if(['cancelled','failed','reversed','blocked'].includes(t.status))return [];
  const amount=parseDecimal(t.amount);
  const description=t.bankDescription||t.externalMemo||t.note||t.counterpartyName||'Bank transaction';
  const counterparty=t.counterpartyName||description;
  const suspicious=/stripe|internal\s*transfer|mercury\s*(treasury|transfer)/i.test(`${description} ${counterparty} ${t.kind||''}`);
  const categories=[[/google.*cloud|google\s*\*/i,'Google Cloud'],[/cloudflare/i,'Cloudflare'],[/supabase/i,'Supabase'],[/payroll|gusto/i,'People']];
  const category=categories.find(([re])=>re.test(description+' '+counterparty))?.[1] || (amount>0?'Other inflows':'Operations');
  const status=t.status==='sent'&&t.postedAt?(suspicious?'review':'posted'):t.status==='pending'?'pending':'review';
  return [validateEntry({...base('mercury',{...t,amount,date:t.postedAt||t.createdAt,currency:t.currency||'USD',description,counterparty,category}),status})];
}
export async function mercury(env=process.env,fetcher=request){
  const entries=[];let cursor;
  for(let page=0;page<100;page++){
    const query=new URLSearchParams({limit:'1000',start:startDate(),order:'asc',...(cursor?{start_after:cursor}:{})});
    const data=await fetcher(`https://api.mercury.com/api/v1/transactions?${query}`,env.MERCURY_API_TOKEN);
    if(!Array.isArray(data.transactions))throw new UserError('Unexpected Mercury response.');
    entries.push(...data.transactions.flatMap(normalizeMercury));
    if(data.transactions.length<1000)return entries;
    const next=data.transactions.at(-1)?.id;if(!next||next===cursor)throw new UserError('Mercury pagination did not advance.');cursor=next;
  }throw new UserError('Mercury sync exceeded 100,000 records; no partial data was saved.');
}
export function normalizeCloudflare(t){
  const charge=t.type==='charge',credit=['credit','refund'].includes(t.type);
  const amount=charge?-Math.abs(parseDecimal(t.amount)):credit?Math.abs(parseDecimal(t.amount)):parseDecimal(t.amount);
  return validateEntry({...base('cloudflare',{...t,amount,date:t.occurred_at,category:'Cloudflare'}),status:charge||credit?'posted':'review'});
}
export async function cloudflare(env=process.env,fetcher=request){
  const entries=[];
  for(let page=1;page<=200;page++){
    const data=await fetcher(`https://api.cloudflare.com/client/v4/user/billing/history?per_page=50&page=${page}`,env.CLOUDFLARE_API_TOKEN);
    if(!Array.isArray(data.result))throw new UserError('Unexpected Cloudflare response.');
    entries.push(...data.result.map(normalizeCloudflare).filter(e=>e.date>=startDate()));
    if(data.result.length<50||(Number.isFinite(data.result_info?.total_count)&&page*50>=data.result_info.total_count))return entries;
  }throw new UserError('Cloudflare sync exceeded 10,000 billing items; no partial data was saved.');
}
export function normalizeGcp(row) {
  if(!Array.isArray(row?.f)||row.f.length!==4)throw new UserError('Unexpected GCP billing row.');
  const [date,currency,costCents,creditCents]=row.f.map(f=>f.v);
  if(![costCents,creditCents].every(v=>typeof v==='string'&&/^-?\d+$/.test(v)))throw new UserError('GCP returned missing or invalid billing amounts; no partial data was saved.');
  return [
    {id:`usage:${date}:${currency}`,date,currency,amount:-Number(costCents),description:'Daily cloud usage',category:'Google Cloud'},
    {id:`credits:${date}:${currency}`,date,currency,amount:-Number(creditCents),description:'Daily cloud billing credits',category:'Google Cloud'},
  ].filter(e=>e.amount!==0).map(e=>validateEntry(base('gcp',e)));
}
export async function gcp(env=process.env,fetcher=request){
  const project=env.GCP_BILLING_PROJECT,table=env.GCP_BILLING_TABLE;
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(project)||!/^([a-z][a-z0-9-]+)\.([A-Za-z0-9_]+)\.([A-Za-z0-9_-]+)$/.test(table))throw new UserError('Invalid GCP project or table. Use project.dataset.table.');
  let token;
  try{token=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/bigquery']}).getAccessToken();}catch{throw new UserError('Google Application Default Credentials are unavailable. Configure ADC and restart.');}
  // Aggregate NUMERIC before rounding: billing exports can contain sub-cent usage.
  const query=`SELECT CAST(DATE(usage_start_time) AS STRING) AS day, currency, CAST(ROUND(SUM(CAST(cost AS NUMERIC)) * 100) AS INT64) AS cost_cents, CAST(ROUND(SUM(IFNULL((SELECT SUM(CAST(c.amount AS NUMERIC)) FROM UNNEST(credits) c),0)) * 100) AS INT64) AS credit_cents FROM \`${table}\` WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) GROUP BY day, currency ORDER BY day`;
  let data=await fetcher(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,useLegacySql:false,maximumBytesBilled:'1000000000',timeoutMs:20000,maxResults:10000,location:env.GCP_BILLING_LOCATION||'US'})});
  for(let poll=0;!data.jobComplete&&poll<12;poll++){
    if(!data.jobReference?.jobId)throw new UserError('BigQuery did not return a job ID.');
    const ref=data.jobReference;
    data=await fetcher(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries/${encodeURIComponent(ref.jobId)}?location=${encodeURIComponent(ref.location||env.GCP_BILLING_LOCATION||'US')}&timeoutMs=10000&maxResults=10000`,token);
  }
  if(!data.jobComplete||data.errors?.length||data.pageToken)throw new UserError('BigQuery query was incomplete or failed. Previous data is preserved.');
  return (data.rows||[]).flatMap(normalizeGcp);
}
export const adapters={stripe,mercury,gcp,cloudflare};
