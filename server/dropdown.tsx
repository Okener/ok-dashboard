import { h, Fragment } from './html.js';
import { Check, ChevronDown } from './icons.js';
export function Dropdown({label,name,icon=null,value,multiple=false,options,change}) {
  const selected=Array.isArray(value)?value:[value];
  const all=selected.length===options.length;
  const caption=multiple?all?'All sources':!selected.length?'No sources':selected.length===1?options.find(o=>o.value===selected[0])?.label:`${selected.length} sources`:options.find(o=>o.value===value)?.label;
  const id=`menu-${name}`;
  return <div className="dropdown" data-menu-name={name}>
    <button type="button" className="dropdown-trigger" aria-label={label} aria-haspopup="menu" aria-expanded="false" aria-controls={id} data-action="menu">{icon}<span>{caption}</span><ChevronDown size={12}/></button>
    <div id={id} role="menu" aria-label={label} className="dropdown-menu" hidden>
      <div className="dropdown-heading">{label}</div>
      {multiple&&<><button role="menuitemcheckbox" aria-checked={all} className="dropdown-option" action={change({[name]:all?[]:options.map(o=>o.value),ledgerPage:0})}><span className={`option-check ${all?'checked':''}`}>{all&&<Check size={12}/>}</span><span>All sources</span></button><div className="dropdown-divider"/></>}
      {options.map(option=>{const checked=selected.includes(option.value);return <button role={multiple?'menuitemcheckbox':'menuitemradio'} aria-checked={checked} className="dropdown-option" action={change({[name]:multiple?checked?selected.filter(v=>v!==option.value):[...selected,option.value]:option.value,ledgerPage:0})}>{multiple?<span className={`option-check ${checked?'checked':''}`}>{checked&&<Check size={12}/>}</span>:option.icon}<span>{option.label}</span>{!multiple&&checked&&<Check className="option-tick" size={14}/>}</button>;})}
      {multiple&&<div className="dropdown-footer">{selected.length} of {options.length} selected<button data-action="menu-close">Done</button></div>}
    </div>
  </div>;
}
