import test from 'node:test';
import assert from 'node:assert/strict';
import { modelFor, renderPage, renderDialog, report } from '../dist/render.mjs';
import { h } from '../server/html.js';
const live={entries:[],connections:[],updatedAt:null};
test('server rendering keeps demo calculations and paginated results on the server',()=>{
 const query=new URLSearchParams({mode:'demo',page:'Transactions',period:'90',ledgerPage:'1'}),model=modelFor(query,live);
 assert.equal(model.ledgerRows.length,12);
 assert.deepEqual(model.ledgerRows,model.filtered.slice(12,24));
 const html=renderPage(query,live);
 assert.equal((html.match(/<tr data-detail/g)||[]).length,12);
 assert.ok(!html.includes('"entries":'));
 assert.ok(!html.includes('/api/data'));
 assert.equal(model.stats.credits-model.stats.debits,model.stats.net);
 const csv=report(query,live).text;
 assert.ok(csv.split('\n').length>model.ledgerRows.length+1,'report includes the whole selected view, not just a page');
});
test('HTML renderer escapes text and attribute data, and never emits event handler code',()=>{
 const payload='<script>alert("x")</script>';
 const html=String(h('div',{'data-value':payload},payload));
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.throws(()=>h('button',{onclick:'alert(1)'}),/Inline event handlers/);
 const entry={id:'<unsafe>',source:'mercury',date:'2026-09-22',amount:1200,currency:'USD',description:payload,category:'Revenue',kind:'credit',basis:'cash',status:'posted',counterparty:'Example'};
 const dialog=renderDialog(new URLSearchParams({mode:'live',detail:'mercury:<unsafe>'}),{...live,entries:[entry]});
 assert.ok(dialog.includes('&lt;script&gt;'));
 assert.ok(!dialog.includes('<script>'));
 assert.ok(!dialog.includes('onClick'));
});
test('custom date and numeric view parameters cannot create unbounded render work',()=>{
 assert.throws(()=>modelFor(new URLSearchParams({period:'custom',start:'2026-02-30',end:'2026-03-01'}),live),/valid date range/);
 assert.throws(()=>modelFor(new URLSearchParams({period:'custom',start:'2000-01-01',end:'2026-03-01'}),live),/valid date range/);
 const model=modelFor(new URLSearchParams({ledgerPage:'Infinity',source:'stripe,invalid'}),live);
 assert.ok(Number.isFinite(model.ledgerPage));assert.deepEqual(model.source,['stripe']);
});
