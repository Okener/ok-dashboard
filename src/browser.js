/* Local interactions only. The ledger and financial calculations stay on the server. */
htmx.config.allowEval = false;
htmx.config.allowScriptTags = false;
htmx.config.historyCacheSize = 0;
htmx.config.includeIndicatorStyles = false;
// Initialize swapped controls immediately; no delayed CSS settling is needed.
htmx.config.defaultSettleDelay = 0;
const $ = (selector, root = document) => root.querySelector(selector);
const state = () => JSON.parse($('#content').dataset.state);
const query = patch => new URLSearchParams(Object.entries({...state(),...patch}).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v)]));
let previousFocus, swapState, menu, menuTop;
const media = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(preference = document.documentElement.dataset.themePreference || 'system') {
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = preference === 'system' ? media.matches ? 'dark' : 'light' : preference;
  document.querySelectorAll('[data-action="theme"]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.value===preference)));
}
media.addEventListener('change',()=>applyTheme());
window.addEventListener('storage',event=>{if(event.key==='ok-finance-theme'||event.key===null){let preference='system';try{preference=localStorage.getItem('ok-finance-theme')||'system';}catch{}applyTheme(['light','dark'].includes(preference)?preference:'system');}});
function closeMenu(focus=false) {
  if(!menu)return;
  const trigger=$('.dropdown-trigger',menu);
  $('.dropdown-menu',menu).hidden=true;
  trigger.setAttribute('aria-expanded','false');
  if(focus)trigger.focus();
  menu=null;
}
function openMenu(container) {
  closeMenu();menu=container;
  const trigger=$('.dropdown-trigger',menu), panel=$('.dropdown-menu',menu), rect=trigger.getBoundingClientRect();
  panel.hidden=false;menuTop=rect.top;
  const width=Math.min(innerWidth-24,Math.max(190,rect.width));
  const upward=innerHeight-rect.bottom<Math.min(panel.scrollHeight,320)&&rect.top>innerHeight-rect.bottom;
  panel.classList.toggle('dropdown-up',upward);
  Object.assign(panel.style,{left:`${Math.max(12,Math.min(rect.left,innerWidth-width-12))}px`,top:`${upward?rect.top-6:rect.bottom+6}px`,width:`${width}px`,maxHeight:`${Math.max(80,upward?rect.top-18:innerHeight-rect.bottom-18)}px`});
  trigger.setAttribute('aria-expanded','true');
  $('[role^="menuitem"]',panel)?.focus({preventScroll:true});
}
window.addEventListener('resize',()=>closeMenu());
window.addEventListener('scroll',event=>{if(menu&&!menu.contains(event.target)&&Math.abs($('.dropdown-trigger',menu).getBoundingClientRect().top-menuTop)>1)closeMenu();},true);
document.addEventListener('pointerdown',event=>{if(menu&&!menu.contains(event.target))closeMenu();});
function closeDialog() {
  $('#dialogs').replaceChildren();$('#content').inert=false;document.body.style.overflow='';
  if(previousFocus?.isConnected)previousFocus.focus();previousFocus=null;
}
function update(patch) {return htmx.ajax('GET','/ui?'+query(patch),{source:$('#content'),target:'#content',swap:'outerHTML'}).catch(()=>{});}
function download(url) {const link=document.createElement('a');link.href=url;link.download='';link.click();}
document.addEventListener('click',event=>{
  const element=event.target.closest('[data-action]');
  if(!element){const row=event.target.closest('tr[data-detail]');if(row&&!event.target.closest('button'))htmx.trigger($('.row-detail',row),'click');return;}
  const action=element.dataset.action;
  if(action==='overlay'){if(event.target===element)closeDialog();return;}
  event.preventDefault();
  if(action==='theme'){const preference=element.dataset.value;try{localStorage.setItem('ok-finance-theme',preference);}catch{}applyTheme(preference);}
  if(action==='menu'){const container=element.closest('.dropdown');menu===container?closeMenu(true):openMenu(container);}
  if(action==='menu-close')closeMenu(true);
  if(action==='close-dialog')closeDialog();
  if(action==='dismiss')element.closest('.toast').remove();
  if(action==='clear-search'){const input=$('#search');input.value='';input.focus();htmx.trigger(input,'input');}
  if(action==='export')download('/ui/report?'+query({}));
  if(action==='template')download('/ui/template?'+query({provider:$('#import-form [name="source"]').value}));
  if(action==='zoom') {
    const wrap=element.closest('.flow-wrap'), group=$('[data-zoom]',wrap);
    const zoom=element.dataset.value==='reset'?1:Math.max(.8,Math.min(1.4,Math.round((Number(group.dataset.zoom)+Number(element.dataset.value))*10)/10));
    const height=group.ownerSVGElement.viewBox.baseVal.height;
    group.dataset.zoom=String(zoom);group.setAttribute('transform',`translate(${515*(1-zoom)},${height/2*(1-zoom)}) scale(${zoom})`);
    $('[data-zoom-label]',wrap).textContent=`${Math.round(zoom*100)}%`;
    $('[data-value="-0.1"]',wrap).disabled=zoom<=.8;$('[data-value="0.1"]',wrap).disabled=zoom>=1.4;
  }
});
document.addEventListener('submit',event=>{if(event.target.matches('#import-form'))event.preventDefault();});
document.addEventListener('change',async event=>{
  const input=event.target;
  if(input.dataset.action==='date'){if(input.value&&input.validity.valid)update({[input.name]:input.value,ledgerPage:0});else{showError('Choose a valid date range of up to two years.');input.value=state()[input.name];}}
  if(input.dataset.action!=='file')return;
  const file=input.files?.[0];if(!file)return;
  const form=input.closest('form'),csv=$('[name="csv"]',form),result=$('#import-result',form),ready=$('.file-ready',form);
  csv.value='';ready.hidden=true;
  // Selecting a new file always invalidates the previous preview/confirmation.
  const button=document.createElement('button');button.type='button';button.className='button primary import-submit';button.textContent='Preview import';button.disabled=true;
  button.setAttribute('hx-post','/ui/import/preview?'+query({}));button.setAttribute('hx-target','#import-result');button.setAttribute('hx-include','#import-form');button.setAttribute('hx-disabled-elt','this, #import-form input[type=file]');button.setAttribute('hx-sync','this:drop');
  result.replaceChildren(button);htmx.process(button);
  if(file.size>2_000_000){const error=document.createElement('div');error.className='import-error';error.setAttribute('role','alert');error.textContent='File must be under 2 MB.';result.prepend(error);return;}
  csv.value=await file.text();ready.textContent=`File loaded · ${(file.size/1024).toFixed(1)} KB`;ready.hidden=false;button.disabled=!csv.value;
});
document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key==='k'){event.preventDefault();update({page:'Transactions',search:'',ledgerPage:0}).then(()=>$('#search')?.focus());return;}
  const dialog=$('[role="dialog"]');
  if(event.key==='Escape'){event.preventDefault();menu?closeMenu(true):closeDialog();return;}
  if(dialog&&event.key==='Tab') {
    const items=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not([type="hidden"]),select,textarea:not([hidden]),[tabindex="0"]')];
    if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}
  }
  const trigger=event.target.closest('.dropdown-trigger');
  if(trigger&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openMenu(trigger.closest('.dropdown'));return;}
  if(menu&&event.target.closest('[role="menu"]')) {
    const items=[...menu.querySelectorAll('[role^="menuitem"]')],index=items.indexOf(document.activeElement);
    if(event.key==='Tab'){event.preventDefault();closeMenu(true);}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
    else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&event.key!==' '){items.slice(index+1).concat(items.slice(0,index+1)).find(item=>item.textContent.toLowerCase().startsWith(event.key.toLowerCase()))?.focus();}
  }
  const svgButton=event.target.closest('svg [role="button"]');
  if(svgButton&&['Enter',' '].includes(event.key)){event.preventDefault();htmx.trigger(svgButton,'click');}
});
function tooltip(element) {
  document.querySelectorAll('.chart-tooltip').forEach(node=>node.remove());
  document.querySelectorAll('[data-tooltip].hovered').forEach(node=>node.classList.remove('hovered'));
  if(!element)return;
  element.classList.add('hovered');
  const [date,credits,debits]=element.dataset.tooltip.split('|'),box=document.createElement('div');box.className='chart-tooltip';
  const title=document.createElement('b');title.textContent=date;box.append(title);
  for(const [label,amount]of [['Credits',credits],['Debits',debits]]){const row=document.createElement('span'),strong=document.createElement('strong');row.textContent=label;strong.textContent=amount;row.append(strong);box.append(row);}
  element.closest('.chart-wrap').append(box);
}
for(const name of ['mouseover','focusin'])document.addEventListener(name,event=>{const bucket=event.target.closest('[data-tooltip]');if(bucket)tooltip(bucket);const flow=event.target.closest('[data-flow]');if(flow){flow.classList.add('hovered');$('[data-flow-label]',flow.closest('.flow-wrap')).textContent=flow.dataset.flow;}});
for(const name of ['mouseout','focusout'])document.addEventListener(name,event=>{const bucket=event.target.closest('[data-tooltip]');if(bucket&&!bucket.contains(event.relatedTarget))tooltip(null);const flow=event.target.closest('[data-flow]');if(flow&&!flow.contains(event.relatedTarget)){flow.classList.remove('hovered');$('[data-flow-label]',flow.closest('.flow-wrap')).textContent='Select a flow for transactions';}});
const observers=new WeakMap();
function initialize() {
  applyTheme();
  document.title=`${state().page} · OK Finance`;
  const chart=$('.chart-wrap');
  if(chart&&!observers.has(chart)){
    let timeout;
    const observer=new ResizeObserver(()=>{clearTimeout(timeout);const width=Math.round(chart.getBoundingClientRect().width-16);if(Math.abs(width-Number(chart.dataset.chartWidth))<20)return;timeout=setTimeout(()=>{if(chart.isConnected)htmx.ajax('GET','/ui/chart?'+query({width}),{target:chart,swap:'outerHTML'}).catch(()=>{});},120);});
    observer.observe(chart);observers.set(chart,{observer,stop:()=>clearTimeout(timeout)});
  }
  const toast=$('.toast');if(toast)setTimeout(()=>toast.remove(),5500);
}
document.addEventListener('htmx:beforeCleanupElement',event=>{const item=observers.get(event.detail.elt);if(item){item.observer.disconnect();item.stop();}});
document.addEventListener('htmx:beforeRequest',event=>{
  if(event.detail.elt.hasAttribute('hx-post')){event.detail.elt.setAttribute('aria-busy','true');$('[data-icon="RefreshCw"]',event.detail.elt)?.classList.add('spinning');}
  if(event.detail.target.id==='dialogs'&&!$('[role="dialog"]'))previousFocus=document.activeElement;
});
document.addEventListener('htmx:beforeSwap',event=>{
  if(event.detail.target.id!=='content')return;
  const active=document.activeElement;
  swapState={id:active.id,selection:active.id==='search'?[active.selectionStart,active.selectionEnd]:null,flowOpen:$('.flow-disclosure')?.open,menuName:active.closest('.dropdown')?.dataset.menuName,multiple:active.getAttribute('role')==='menuitemcheckbox'};
  closeMenu();
});
document.addEventListener('htmx:afterSwap',event=>{
  if(event.detail.target.id==='content'){
    closeDialog();initialize();
    if(swapState?.flowOpen&&$('.flow-disclosure'))$('.flow-disclosure').open=true;
    if(swapState?.id){const active=document.getElementById(swapState.id);active?.focus();if(swapState.selection)active?.setSelectionRange(...swapState.selection);}
    if(swapState?.menuName){const container=document.querySelector(`[data-menu-name="${swapState.menuName}"]`);if(container)swapState.multiple?openMenu(container):$('.dropdown-trigger',container).focus();}
    swapState=null;
  }
  if(event.detail.target.id==='dialogs') {
    const dialog=$('[role="dialog"]');
    if(dialog){$('#content').inert=true;document.body.style.overflow='hidden';$('button:not(:disabled)',dialog)?.focus();}
  }
  if(event.detail.target.classList?.contains('chart-wrap'))initialize();
});
document.addEventListener('htmx:afterRequest',event=>{event.detail.elt.removeAttribute('aria-busy');$('[data-icon="RefreshCw"]',event.detail.elt)?.classList.remove('spinning');});
function showError(message) {
  let notice=$('#request-error');
  if(!notice){notice=document.createElement('div');notice.id='request-error';notice.className='toast';notice.setAttribute('role','alert');const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Dismiss notification');close.dataset.action='dismiss';notice.append(document.createElement('span'),close);document.body.append(notice);}
  $('span',notice).textContent=message;
}
document.addEventListener('htmx:responseError',event=>{let message='The request could not be completed.';try{message=JSON.parse(event.detail.xhr.responseText).error||message;}catch{}showError(message);});
document.addEventListener('htmx:sendError',()=>showError('The local data service is unavailable. Restart npm run dev and try again.'));
initialize();
