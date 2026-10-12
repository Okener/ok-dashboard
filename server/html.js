// JSX here is only an HTML template syntax. There is no browser component runtime.
export class HTML { constructor(value) { this.value = value; } toString() { return this.value; } }
export const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const Fragment = ({children=[]}) => new HTML(childrenHTML(children));
const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const booleanAttrs = new Set(['disabled','hidden','multiple','open','checked','selected','required','autofocus','inert']);
const names = {className:'class',tabIndex:'tabindex',htmlFor:'for',textAnchor:'text-anchor',strokeWidth:'stroke-width',strokeOpacity:'stroke-opacity',strokeDasharray:'stroke-dasharray',fillOpacity:'fill-opacity'};
const childrenHTML = children => children.flat(Infinity).map(child => child == null || typeof child === 'boolean' ? '' : child instanceof HTML ? child.value : escape(child)).join('');
export function h(tag, props, ...children) {
  props ||= {};
  if (typeof tag === 'function') return tag({...props, children});
  if (tag === Fragment) return new HTML(childrenHTML(children));
  const attributes = {...props};
  if(tag==='button')attributes.type ||= 'button';
  if (attributes.action) {
    const {url,target='#content',method='get',values} = attributes.action;
    Object.assign(attributes,{[`hx-${method}`]:url,'hx-target':target,'hx-swap':target==='#content'?'outerHTML':'innerHTML'});
    if (values) attributes['hx-vals']=JSON.stringify(values);
    if (method==='post') {if(url.includes('/import'))attributes['hx-include']='#import-form';attributes['hx-disabled-elt']=url.includes('/import')?'this, #import-form input[type=file]':'this';attributes['hx-sync']='this:drop';}

    delete attributes.action;
  }
  const attrs=Object.entries(attributes).map(([key,value]) => {
    if (key==='key'||key==='children'||value==null||typeof value==='function')return '';
    if (/^on/i.test(key))throw new Error('Inline event handlers are not permitted.');
    key=names[key]||key;
    if (booleanAttrs.has(key))return value?` ${key}`:'';
    return ` ${key}="${escape(value)}"`;
  }).join('');
  return new HTML(`<${tag}${attrs}>${voidTags.has(tag)?'':childrenHTML(children)+`</${tag}>`}`);
}
