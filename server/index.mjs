import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { providers } from '../src/finance.js';
import { renderPage, renderDialog, renderChart, renderPreview, report, modelFor } from '../dist/render.mjs';
import { adapters, configuration } from './adapters.mjs';
import { loadStore, mutateStore } from './store.mjs';
import { UserError, parseCSV, mergeEntries, replaceSyncedEntries, validateEntry } from './ledger.mjs';
const port=Number(process.env.API_PORT||4174);
let syncing=false;
const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`,'127.0.0.1:5173','localhost:5173']);
const sendJSON=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
async function body(req) {
  const type=req.headers['content-type']||'';
  const form=req.url.startsWith('/ui/')&&type.startsWith('application/x-www-form-urlencoded');
  if(!form&&!type.startsWith('application/json'))throw new UserError('Expected application/json.');
  let size=0,chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>(form?6_100_000:2_100_000))throw new UserError('Request exceeds 2 MB.');chunks.push(chunk);}
  const text=Buffer.concat(chunks).toString();
  if(form){const payload=Object.fromEntries(new URLSearchParams(text));if(payload.csv&&Buffer.byteLength(payload.csv)>2_000_000)throw new UserError('CSV must be under 2 MB.');return payload;}
  try{return JSON.parse(text);}catch{throw new UserError('Invalid JSON.');}
}
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
function sendHTML(req,res,html,headers={}) {
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Vary':'HX-Request','X-Content-Type-Options':'nosniff','Content-Security-Policy':csp,...headers});
  res.end(req.method==='HEAD'?undefined:html);
}
function documentHTML(content) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f7f8fa"><meta name="description" content="A clear view of your business finances."><title>OK Finance</title><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="/styles.css"><script src="/theme-init.js"></script><script src="/htmx.min.js" defer></script><script src="/browser.js" defer></script></head><body hx-history="false">${content}<div id="dialogs"></div></body></html>`;
}
function publicData(store){const config=configuration();return {mode:'live',entries:store.entries,updatedAt:store.updatedAt,connections:providers.map(p=>({id:p.id,configured:config[p.id],method:p.method,lastSync:store.connections[p.id]?.lastSync||null,count:store.entries.filter(e=>e.source===p.id).length,error:store.connections[p.id]?.error||null}))};}
const server=http.createServer(async(req,res)=>{
  let url;
  try{url=new URL(req.url,'http://localhost');}catch{return sendJSON(res,400,{error:'Invalid request URL.'});}
  const uiAction=req.method==='POST'&&url.pathname.startsWith('/ui/');
  const send=async(res,status,data)=>{
    if(!uiAction||status!==200&&!(url.pathname==='/ui/import/preview'&&status===400))return sendJSON(res,status,data);
    const live=publicData(await loadStore());
    if(url.pathname==='/ui/import/preview')return sendHTML(req,res,renderPreview(url.searchParams,live,status===200?data:null,status===200?'':data.error));
    if(status!==200)return sendJSON(res,status,data);
    const params=new URLSearchParams(url.searchParams);
    let notice=data.message||'';
    if(url.pathname==='/ui/import'){
      params.set('mode','live');params.set('basis',['gcp','cloudflare'].includes(importSource)?'accrual':'cash');params.set('source',providers.map(p=>p.id).join(','));params.set('ledgerPage','0');
      notice=`Imported ${data.count} records; matching IDs updated.`;
    }
    if(url.pathname==='/ui/classify')notice='Classification saved.';
    if(url.pathname==='/ui/sync'&&data.synced)params.set('mode','live');
    return sendHTML(req,res,renderPage(params,live,notice),{'HX-Push-Url':'/?'+params});
  };
  let importSource;
  try{
    if(!allowedHosts.has(req.headers.host))return sendJSON(res,403,{error:'Only the local workspace host is allowed.'});
    if(req.headers.origin&&!['http://127.0.0.1:5173','http://localhost:5173',`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin))return sendJSON(res,403,{error:'Cross-origin requests are not allowed.'});
    if(req.headers['sec-fetch-site']==='cross-site')return sendJSON(res,403,{error:'Cross-site requests are not allowed.'});
    if((req.method==='GET'||req.method==='HEAD')&&['/','/ui','/ui/dialog','/ui/chart','/ui/report','/ui/template'].includes(url.pathname)){
      const live=publicData(await loadStore());
      if(url.pathname==='/ui/report'){
        const {text,name}=report(url.searchParams,live);res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(req.method==='HEAD'?undefined:text);
      }
      if(url.pathname==='/ui/template'){
        const provider=providers.find(p=>p.id===url.searchParams.get('provider'));if(!provider)throw new UserError('Unknown provider.');
        const csv=`id,source,date,amount,currency,description,category,kind,basis,status,counterparty\ninvoice-example,${provider.id},${new Date().toISOString().slice(0,10)},-49.00,USD,Monthly invoice,${provider.name},debit,${['stripe','mercury'].includes(provider.id)?'cash':'accrual'},posted,${provider.name}\n`;
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${provider.id}-template.csv"`,'Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:csv);
      }
      if(url.pathname==='/ui/dialog')return sendHTML(req,res,renderDialog(url.searchParams,live));
      if(url.pathname==='/ui/chart')return sendHTML(req,res,renderChart(url.searchParams,live));
      const content=renderPage(url.searchParams,live);
      return sendHTML(req,res,url.pathname==='/ui'?content:documentHTML(content),url.pathname==='/ui'?{'HX-Push-Url':'/?'+url.searchParams}:{});
    }
    if(uiAction)modelFor(url.searchParams,publicData(await loadStore()));
    const path=uiAction?url.pathname.replace('/ui/','/api/'):url.pathname;
    if(req.method==='GET'&&path==='/api/data')return await send(res,200,publicData(await loadStore()));
    if(req.method==='POST'&&['/api/import/preview','/api/import'].includes(path)){
      const payload=await body(req);importSource=payload.source;const entries=parseCSV(payload.csv,payload.source);
      if(path.endsWith('/preview'))return await send(res,200,{entries});
      await mutateStore(store=>{store.entries=mergeEntries(store.entries,entries,store.overrides);store.updatedAt=new Date().toISOString();store.connections[payload.source]={...store.connections[payload.source],lastSync:store.updatedAt,error:null};});
      return await send(res,200,{count:entries.length});
    }
    if(req.method==='POST'&&path==='/api/classify'){
      const {id,source,kind}=await body(req);
      if(!['transfer','credit','debit'].includes(kind))throw new UserError('Invalid classification.');
      await mutateStore(store=>{const e=store.entries.find(e=>e.id===id&&e.source===source);if(!e||e.status==='pending'||e.basis!=='cash')throw new UserError('Only posted or review cash entries can be classified.');if(kind!=='transfer'&&kind!==(e.amount>=0?'credit':'debit'))throw new UserError('Classification must match amount sign.');const key=`${source}:${id}`;const originalCategory=store.overrides[key]?.originalCategory||(e.category==='Internal transfer'?'Uncategorized':e.category);const override={kind,status:'posted',category:kind==='transfer'?'Internal transfer':originalCategory,originalCategory};store.overrides[key]=override;Object.assign(e,validateEntry({...e,...override}));store.updatedAt=new Date().toISOString();});return await send(res,200,{ok:true});
    }
    if(req.method==='POST'&&path==='/api/sync'){
      const payload=await body(req),config=configuration();
      if(payload.provider&&!providers.some(p=>p.id===payload.provider))throw new UserError('Unknown provider.');
      if(syncing)return await send(res,409,{error:'A sync is already running.'});
      const ids=Object.keys(adapters).filter(id=>config[id]&&(!payload.provider||payload.provider===id));
      if(!ids.length)throw new UserError('No API sources configured. Add credentials to .env and restart, or import a CSV in Integrations.');
      syncing=true;let success=0;
      try{for(const id of ids){try{const coverageStart=new Date(Date.now()-365*86400000).toISOString().slice(0,10);const entries=await adapters[id]();await mutateStore(store=>{const snapshot=replaceSyncedEntries(store.entries,entries,id,store.connections[id]?.syncIds||[],coverageStart,store.overrides);store.entries=snapshot.entries;store.updatedAt=new Date().toISOString();store.connections[id]={lastSync:store.updatedAt,error:null,syncIds:snapshot.syncIds};});success++;}catch(e){const error=e instanceof UserError?e.message:'Sync failed due to an unexpected provider response. Previous data is preserved.';await mutateStore(store=>{store.connections[id]={...store.connections[id],error};});}}}finally{syncing=false;}
      return await send(res,200,{synced:success,message:`${success} of ${ids.length} sources synced.${success<ids.length?' Check Integrations for source errors.':''}`});
    }
    if(path.startsWith('/api/')||url.pathname.startsWith('/ui/'))return await send(res,404,{error:'API route not found.'});
    if(req.method!=='GET'&&req.method!=='HEAD')return await send(res,405,{error:'Method not allowed.'});
    if(!['/styles.css','/browser.js','/htmx.min.js','/theme-init.js','/favicon.svg','/ok-logo.svg'].includes(url.pathname)&&!url.pathname.startsWith('/brands/'))return sendJSON(res,404,{error:'File not found.'});
    const root=resolve('dist');let file=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+sep)&&file!==root)return await send(res,403,{error:'Forbidden.'});
    try{if(!(await stat(file)).isFile())return sendJSON(res,404,{error:'File not found.'});}catch{return sendJSON(res,404,{error:'File not found.'});}
    try{const content=await readFile(file);const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Content-Security-Policy':csp});res.end(req.method==='HEAD'?undefined:content);}catch{send(res,404,{error:'Frontend not built. Run npm run build or use npm run dev.'});}
  }catch(e){
    const status=e instanceof UserError||e.status===400?400:500;
    const data={error:status===400?e.message:'Local data service error. Check that the ledger file is valid and the data directory is writable.'};
    if(e instanceof UserError)await send(res,status,data);else sendJSON(res,status,data);
  }
});
server.requestTimeout=30000;
server.listen(port,'127.0.0.1',()=>console.log(`OK Finance data service: http://127.0.0.1:${port}`));
