import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
export const dataDir=resolve(process.env.DATA_DIR||'.data');
const file=join(dataDir,'ledger.json');
export async function loadStore(){try{const store=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(store.entries)||!store.connections||!store.overrides)throw new Error('Invalid store');return store;}catch(e){if(e.code==='ENOENT')return {entries:[],connections:{},overrides:{},updatedAt:null};throw new Error('The ledger could not be read. Restore .data/ledger.json from a backup; it has not been overwritten.');}}
export async function saveStore(store){await mkdir(dataDir,{recursive:true,mode:0o700});const temp=join(dataDir,`.ledger-${randomUUID()}.tmp`);await writeFile(temp,JSON.stringify(store),{mode:0o600});await rename(temp,file);}
let queue=Promise.resolve();
export function mutateStore(fn){const work=queue.then(async()=>{const store=await loadStore();const result=await fn(store);await saveStore(store);return result;});queue=work.catch(()=>{});return work;}
