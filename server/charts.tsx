import { h, Fragment } from './html.js';
import type { Entry } from '../src/types';
import { Minus, Plus, RotateCcw } from './icons.js';
import { dailySeries, flowModel, money } from '../src/finance.js';
const palette = ['#6479ed','#9aa9ee','#b1bdea','#c4cbdf','#d5dbea','#a2b4c5','#dfcbaa','#b7cfc2'];
export function CashChart({ entries, range, currency, width=850 }: {entries: Entry[]; range: {start:string;end:string}; currency:string;width?:number}) {
  const data = dailySeries(entries, range);
  const bucketCount=Math.min(data.length,32,Math.max(7,Math.floor(width/22)));
  const buckets = Array.from({length: bucketCount}, (_, i) => {
    const values = data.slice(Math.floor(i * data.length / bucketCount), Math.floor((i + 1) * data.length / bucketCount));
    return { date: values[0]?.date, end: values.at(-1)?.date, credits: values.reduce((s, d) => s + d.credits, 0), debits: values.reduce((s, d) => s + d.debits, 0) };
  });
  const max = Math.max(100, ...buckets.flatMap(d => [d.credits, d.debits])) * 1.16;
  const w = width, chartHeight = 224, left = 62, right = 15, top = 16, bottom = 34, inner = chartHeight-top-bottom;
  const step = (w-left-right)/buckets.length;
  return <div className="chart-wrap" data-chart-width={width} ><svg viewBox={`0 0 ${w} ${chartHeight}`} role="img" aria-label="Credits and debits over time">
    {[0,1,2,3,4].map(i => <g key={i}><line x1={left} x2={w-right} y1={top+inner*i/4} y2={top+inner*i/4} stroke="var(--chart-grid)" strokeDasharray={i === 4 ? undefined : '3 4'}/><text x={left-12} y={top+inner*i/4+4} textAnchor="end" className="axis">{money(max*(1-i/4),currency,true)}</text></g>)}
    {buckets.map((d, i) => <g key={i} tabIndex={0} aria-label={`${d.date} to ${d.end}: credits ${money(d.credits,currency)}, debits ${money(d.debits,currency)}`} data-tooltip={`${d.date}${d.end!==d.date?" – "+d.end:""}|${money(d.credits,currency)}|${money(d.debits,currency)}`}   >
      <rect x={left+i*step} y={top} width={step} height={inner} fill="transparent"/>
      <rect x={left+i*step+step*.13} y={top+inner-d.credits/max*inner} width={step*.32} height={d.credits/max*inner} rx={2} fill="var(--chart-credit)"/>
      <rect x={left+i*step+step*.51} y={top+inner-d.debits/max*inner} width={step*.32} height={d.debits/max*inner} rx={2} fill="var(--chart-debit)"/>
      {(i === 0 || i === buckets.length-1 || i % Math.ceil(buckets.length/(width<500?3:6)) === 0) && <text x={left+i*step+step/2} y={chartHeight-9} textAnchor="middle" className="axis">{new Date((i===buckets.length-1?d.end:d.date)+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</text>}
    </g>)}
  </svg></div>;
}
export function MoneyFlow({ entries, currency, view, show }: {entries:Entry[];currency:string;view:'sankey'|'nodes';show:Function}) {
  const model = flowModel(entries);
  const zoom=1;
  if (!model.total) return <div className="empty-chart">No posted activity in this view.<span>Change the period or connect a data source.</span></div>;
  const spending = model.outputs.filter(e => !['Net retained','Net billing credit'].includes(e.name));
  const outputs = [...(spending.length > 6 ? [...spending.slice(0,5), {name:'Other expenses',value:spending.slice(5).reduce((s,e)=>s+e.value,0)}] : spending), ...model.outputs.filter(e => ['Net retained','Net billing credit'].includes(e.name))];
  const height = Math.max(340,outputs.length*52+35);
  const totalHeight = height-outputs.length*22-48;
  let inOffset = 0, outOffset = 0;
  const inputs = model.inputs.map((e,i)=>{ const size=e.value/model.total*totalHeight;const r={...e,y:55+inOffset+i*22,size,offset:inOffset,color:i===0?'#6d66e8':'#90a5d9'}; inOffset+=size;return r; });
  const outs = outputs.map((e,i)=>{const size=e.value/model.total*totalHeight;const r={...e,y:36+outOffset+i*22,size,offset:outOffset,color:['Net retained','Net billing credit'].includes(e.name)?'#50a78d':palette[i%palette.length]};outOffset+=size;return r;});
  const midY = (height-totalHeight)/2;
  const ribbon = (x1:number,y1:number,x2:number,y2:number,size:number) => `M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2} L ${x2} ${y2+size} C ${(x1+x2)/2} ${y2+size}, ${(x1+x2)/2} ${y1+size}, ${x1} ${y1+size} Z`;
  return <div className={`flow-wrap ${view}`}><div className="flow-column-labels"><span>MONEY IN</span><span>ALLOCATION</span><span>MONEY OUT & RETAINED</span></div>
    <div className="flow-canvas"><svg viewBox={`0 0 1030 ${height}`} role="group" aria-label={view==='sankey'?'Sankey diagram of period cash allocation; ribbon width is proportional to amount':'Interactive node graph of period cash allocation'}>
    <g data-zoom="1" transform={`translate(${515*(1-zoom)},${height/2*(1-zoom)}) scale(${zoom})`}>
    {view==='sankey' ? <>
      {inputs.map(e=><g key={e.name} data-flow={e.name}  action={show({flowDetail:e.name})} tabIndex={0} role="button" aria-label={`${e.name}, ${money(e.value,currency)}`} >
        <path d={ribbon(188,e.y,475,midY+e.offset,e.size)} fill={e.color} fillOpacity=".2"/><rect x={181} y={e.y} width={7} height={e.size} fill={e.color} rx={2}/><text x={166} y={e.y+e.size/2-4} textAnchor="end" className="flow-name">{e.name}</text><text x={166} y={e.y+e.size/2+14} textAnchor="end" className="flow-value">{money(e.value,currency,true)}</text><title>{e.name}: {money(e.value,currency)}</title>
      </g>)}
      <rect x={475} y={midY} width={8} height={totalHeight} rx={2} fill="#546bc2"/>
      {outs.map(e=><g key={e.name} data-flow={e.name}  action={show({flowDetail:e.name})} tabIndex={0} role="button" aria-label={`${e.name}, ${money(e.value,currency)}`} >
        <path d={ribbon(483,midY+e.offset,820,e.y,e.size)} fill={e.color} fillOpacity=".22"/><rect x={820} y={e.y} width={7} height={e.size} fill={e.color} rx={2}/><text x={843} y={e.y+Math.max(e.size/2,5)-3} className="flow-name">{e.name}</text><text x={843} y={e.y+Math.max(e.size/2,5)+14} className="flow-value">{money(e.value,currency,true)}</text><title>{e.name}: {money(e.value,currency)}</title>
      </g>)}
    </> : <>
      {inputs.map((e,i)=>{const y=height/2+(i-(inputs.length-1)/2)*90;return <g key={e.name}><path d={`M 270 ${y} C 360 ${y},360 ${height/2},455 ${height/2}`} fill="none" stroke={e.color} strokeOpacity=".45" strokeWidth={Math.max(2,e.value/model.total*13)}/><g role="button" tabIndex={0} action={show({flowDetail:e.name})}  aria-label={e.name}><rect x={80} y={y-29} width={190} height={58} rx={9} fill="var(--surface)" stroke="var(--border)"/><circle cx={101} cy={y} r={5} fill={e.color}/><text x={117} y={y-3} className="flow-name">{e.name}</text><text x={117} y={y+15} className="flow-value">{money(e.value,currency,true)}</text></g></g>;})}
      {outs.map((e,i)=>{const y=30+i*(height-60)/Math.max(1,outs.length-1);return <g key={e.name}><path d={`M 590 ${height/2} C 675 ${height/2},675 ${y},758 ${y}`} fill="none" stroke={e.color} strokeOpacity=".5" strokeWidth={Math.max(1.5,e.value/model.total*14)}/><g role="button" tabIndex={0} action={show({flowDetail:e.name})}  aria-label={e.name}><rect x={758} y={y-20} width={205} height={40} rx={7} fill="var(--surface)" stroke="var(--border)"/><circle cx={775} cy={y} r={4} fill={e.color}/><text x={787} y={y+4} className="flow-name">{e.name}</text><text x={950} y={y+4} textAnchor="end" className="flow-value">{money(e.value,currency,true)}</text></g></g>;})}
      <rect x={455} y={height/2-40} width={135} height={80} rx={12} fill="var(--node-center)" stroke="#8093e3"/><text x={522} y={height/2-8} textAnchor="middle" className="flow-name">{entries[0]?.basis==='accrual'?'Billing allocation':'Cash allocation'}</text><text x={522} y={height/2+16} textAnchor="middle" className="flow-total">{money(model.total,currency,true)}</text>
    </>}
    </g></svg></div>
    <div className="flow-bottom"><span><i className="dot blue"/> <span data-flow-label>Select a flow for transactions</span></span><div className="zoom-controls"><button aria-label="Zoom out" disabled={zoom<=.8} data-action="zoom" data-value="-0.1"><Minus size={13}/></button><span data-zoom-label>{Math.round(zoom*100)}%</span><button aria-label="Zoom in" disabled={zoom>=1.4} data-action="zoom" data-value="0.1"><Plus size={13}/></button><button aria-label="Reset zoom" data-action="zoom" data-value="reset"><RotateCcw size={12}/></button></div></div>
  </div>;
}
