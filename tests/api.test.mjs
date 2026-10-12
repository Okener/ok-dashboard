import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import http from 'node:http';
test('local API persists idempotent imports, rejects invalid requests, and preserves data on failed sync',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ok-dashboard-test-'));
 const port='4189',root=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,DATA_DIR:dir,API_PORT:port,STRIPE_SECRET_KEY:'',MERCURY_API_TOKEN:'',GCP_BILLING_PROJECT:'',CLOUDFLARE_API_TOKEN:''},stdio:['ignore','pipe','pipe']});
 try{
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Server exited before ready');}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('Server startup timed out')),10000);t.unref();})]);
 const get=()=>fetch(root+'/api/data').then(r=>r.json());
 const post=(path,data,origin=root)=>fetch(root+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});
 assert.equal((await get()).entries.length,0);
 assert.deepEqual((await get()).connections.map(c=>c.id),['stripe','mercury','gcp','cloudflare']);
 const csv='id,source,date,amount,currency,description,category,kind,basis,status,counterparty\na,mercury,2026-09-22,23.49,USD,Stripe settlement,Revenue,credit,cash,review,Stripe';
 assert.equal((await post('/api/import/preview',{source:'mercury',csv})).status,200);assert.equal((await get()).entries.length,0);
 for(let i=0;i<2;i++)assert.equal((await post('/api/import',{source:'mercury',csv})).status,200);
 assert.equal((await get()).entries.length,1);assert.equal((await get()).entries[0].amount,2349);
 assert.equal((await post('/api/classify',{source:'mercury',id:'a',kind:'transfer'})).status,200);
 assert.equal((await get()).entries[0].kind,'transfer');
 await post('/api/import',{source:'mercury',csv});assert.equal((await get()).entries[0].kind,'transfer');
 assert.equal((await post('/api/classify',{source:'mercury',id:'a',kind:'credit'})).status,200);
 assert.equal((await get()).entries[0].category,'Revenue');
 await post('/api/import',{source:'mercury',csv});assert.equal((await get()).entries[0].category,'Revenue');
 assert.equal((await get()).entries[0].originalCategory,undefined);
 assert.equal((await post('/api/sync',{})).status,400);assert.equal((await get()).entries.length,1);
 assert.equal((await post('/api/import',{source:'mercury',csv:csv.replace('23.49','NaN')})).status,400);
 assert.equal((await post('/api/import',{source:'mercury',csv},'https://untrusted.example')).status,403);
 const badHostStatus=await new Promise((resolve,reject)=>{http.get(root+'/api/data',{headers:{Host:'rebound.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(badHostStatus,403);
 assert.equal((await get()).entries.length,1);assert.equal((await get()).connections.find(c=>c.id==='mercury').count,1);
 const view='mode=live&page=Transactions&period=custom&start=2026-09-22&end=2026-09-22';
 const html=await fetch(root+'/ui?'+view);assert.equal(html.headers.get('cache-control'),'no-store');assert.equal(html.headers.get('hx-push-url'),'/?'+view);assert.ok((await html.text()).includes('Stripe settlement'));
 const full=await fetch(root+'/?'+view);assert.ok((await full.text()).startsWith('<!doctype html>'));
 assert.equal((await fetch(root+'/render.mjs')).status,404,'server template bundle is not a public asset');
 assert.equal((await fetch(root+'/ui?period=custom&start=2026-02-30&end=2026-03-01')).status,400);
 const form=new URLSearchParams({source:'mercury',csv});
 const preview=await fetch(root+'/ui/import/preview?'+view,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:root},body:form});
 assert.equal(preview.status,200);assert.ok((await preview.text()).includes('1 valid records'));assert.equal((await get()).entries.length,1);
 const denied=await fetch(root+'/ui/import/preview?'+view,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:'https://untrusted.example'},body:form});assert.equal(denied.status,403);
 const invalid=await fetch(root+'/ui/import/preview?'+view,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({source:'mercury',csv:'invalid'})});assert.equal(invalid.status,200);assert.ok((await invalid.text()).includes('role="alert"'));
 const exportResponse=await fetch(root+'/ui/report?'+view);assert.ok(exportResponse.headers.get('content-disposition').includes('ok-finance'));assert.ok((await exportResponse.text()).includes('Stripe settlement'));

 } finally {if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await rm(dir,{recursive:true,force:true});}
});
