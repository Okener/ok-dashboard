import { h, Fragment } from './html.js';
import App from './views';
import { CashChart } from './charts';
import { providers, dateRange, previousRange, filterEntries, summarize, groupAmounts, exportCSV } from '../src/finance.js';
import { demoData } from '../src/demo.js';
class UserError extends Error { status=400; }
const ids=providers.map(p=>p.id);
function choice(value, values, fallback) {return values.includes(value)?value:fallback;}
export function modelFor(query:URLSearchParams,live) {
  const period=choice(query.get('period'),['7','30','90','month','year','custom'],'30');
  const defaultRange=dateRange('30');
  const customRange={start:query.get('start')||defaultRange.start,end:query.get('end')||defaultRange.end};
  if(period==='custom') {
    const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
    if(!valid(customRange.start)||!valid(customRange.end)||customRange.start>customRange.end||Date.parse(customRange.end)-Date.parse(customRange.start)>730*86400000)throw new UserError('Choose a valid date range of up to two years.');
  }
  const state={page:choice(query.get('page'),['Overview','Transactions','Integrations'],'Overview'),mode:choice(query.get('mode'),['demo','live'],live.entries.length?'live':'demo'),period,start:customRange.start,end:customRange.end,currency:choice(query.get('currency'),['USD','EUR','GBP','CAD','AUD','CHF','SGD','NZD'],'USD'),source:query.has('source')?[...new Set(query.get('source').split(',').filter(id=>ids.includes(id)))]:ids,basis:choice(query.get('basis'),['cash','accrual'],'cash'),flowView:choice(query.get('flowView'),['sankey','nodes'],'sankey'),search:(query.getAll('search').at(-1)||'').slice(0,500),direction:choice(query.get('direction'),['all','credit','debit','transfer'],'all'),ledgerPage:Math.max(0,Math.floor(Number(query.get('ledgerPage'))||0))};
  const dataset=state.mode==='demo'?demoData():live;
  const range=period==='custom'?customRange:dateRange(period);
  const entries=filterEntries(dataset.entries,range,state.currency,state.source,state.basis);
  const stats=summarize(entries),prior=summarize(filterEntries(dataset.entries,previousRange(range),state.currency,state.source,state.basis));
  const expenses=groupAmounts(entries,'debit');
  const filtered=entries.filter(e=>(state.direction==='all'||e.kind===state.direction)&&`${e.description} ${e.counterparty} ${e.category} ${providers.find(p=>p.id===e.source)?.name}`.toLowerCase().includes(state.search.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  state.ledgerPage=Math.min(state.ledgerPage,Math.max(0,Math.ceil(filtered.length/12)-1));
  const encode=patch=>new URLSearchParams(Object.entries({...state,...patch}).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v)])).toString();
  const change=patch=>({url:'/ui?'+encode(patch)});
  const show=patch=>({url:'/ui/dialog?'+encode(patch),target:'#dialogs'});
  const mutation=(path,values,target)=>({url:'/ui/'+path+'?'+encode({}),method:'post',values,target});
  const modal=choice(query.get('modal'),['help',...ids],null);
  const detail=dataset.entries.find(e=>`${e.source}:${e.id}`===query.get('detail'))||null;
  const connections=live.connections;
  return {...state,state,live,dataset,customRange,range,entries,stats,prior,expenses,currencies:[...new Set(['USD',...dataset.entries.map(e=>e.currency)])],filtered,ledgerRows:state.page==='Transactions'?filtered.slice(state.ledgerPage*12,(state.ledgerPage+1)*12):filtered.slice(0,5),connections,connected:connections.filter(c=>c.lastSync).length,failedSources:connections.filter(c=>c.error).length,modal,detail,flowDetail:query.get('flowDetail'),importProvider:ids.includes(modal)?modal:'cloudflare',preview:null,importError:'',notice:'',change,show,mutation};
}
export function renderPage(query,live,notice='') {const model=modelFor(query,live);model.notice=notice;return String(App(model));}
export function renderDialog(query,live) {return String(App(modelFor(query,live),true));}
export function renderChart(query,live) {const model=modelFor(query,live);const width=Math.max(280,Math.min(1800,Number(query.get('width'))||850));return String(<CashChart entries={model.entries} range={model.range} currency={model.currency} width={width}/>);}
export function report(query,live) {const m=modelFor(query,live);return {text:exportCSV(m.entries),name:`ok-finance-${m.basis}-${m.range.start}-${m.range.end}.csv`};}
export function renderPreview(query,live,result,error='') {
  const {mutation}=modelFor(query,live);
  return String(<>{error&&<div role="alert" className="import-error">{error}</div>}{result&&<div className="import-preview"><b>{result.entries.length} valid records</b><span>{result.entries[0]?.date} · {result.entries[0]?.description}</span><p>Import updates matching source + ID records. It does not merge demo data.</p><button className="button primary" action={mutation('import',{},'#content')}>Confirm import</button></div>}{!result&&<button className="button primary import-submit" action={mutation('import/preview',{},'#import-result')}>Preview import</button>}</>);
}
