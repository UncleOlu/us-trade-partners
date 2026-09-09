// Independent annual-data oracle. Do not import product aggregation helpers.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {REPO_ROOT,currentSnapshotId} from './server.mjs';
export const snapshot=currentSnapshotId();
const root=path.join(REPO_ROOT,'data',snapshot);
export const sourceHashes={};
export function readAnnual(file){const bytes=fs.readFileSync(path.join(root,file));sourceHashes[file]=createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes);}
export const years=readAnnual('meta.json').configured_coverage.years;
export function flowExpected(values){
 if(values.length!==years.length||values.some(v=>!v||v.status==='absent'))return {status:'absent',value:null};
 const applicable=values.filter(v=>v.status!=='not_applicable');
 if(!applicable.length)return {status:'not_applicable',value:null};
 let n=0n;
 for(const v of applicable){if(!['observed','confirmed_zero'].includes(v.status)||!Number.isSafeInteger(v.value))throw new Error('Invalid independent input');n+=BigInt(v.value);}
 if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))throw new Error('Unsafe independent sum');
 return {status:applicable.every(v=>v.status==='confirmed_zero')?'confirmed_zero':'observed',value:Number(n)};
}
export function recordExpected(records){
 const imports=flowExpected(records.map(r=>r?.imports));const exports=flowExpected(records.map(r=>r?.exports));
 const complete=imports.value!==null&&exports.value!==null;
 const derived=op=>{if(!complete)return {status:'absent',value:null};const value=op(BigInt(imports.value),BigInt(exports.value));if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))throw new Error('Unsafe derived sum');return {status:'observed',value:Number(value)};};
 return {imports,exports,balance:derived((i,e)=>e-i),total_trade_value:derived((i,e)=>i+e)};
}
export const summaries=years.map(y=>readAnnual(`summary/${y}.json`));
export const expectedWorld=recordExpected(summaries.map(s=>s.world));
export const expectedPartners=Object.fromEntries([...new Set(summaries.flatMap(s=>s.partners.map(p=>p.code)))].sort().map(code=>[code,recordExpected(summaries.map(s=>s.partners.find(p=>p.code===code)))]));
export function expectedPartner(code){const data=readAnnual(`partner/${code}.json`);const rows=years.map(y=>data.years.find(r=>r.year===y));const groups={};const groupIds=[...new Set(data.sections.flatMap(s=>s.groups.map(g=>g.section_id)))];for(const id of groupIds){const annual=years.map(y=>data.sections.find(s=>s.year===y)?.groups.find(g=>g.section_id===id));const chapters={};for(const ch of [...new Set(annual.flatMap(g=>g?.chapters.map(c=>c.chapter)??[]))].sort())chapters[ch]=recordExpected(annual.map(g=>g?.chapters.find(c=>c.chapter===ch)));groups[id]={...recordExpected(annual),chapters};}return {totals:recordExpected(rows),groups};}
export function expectedSection(id){const data=readAnnual(`section/${id}.json`);const annual=years.map(y=>data.years.find(r=>r.year===y));return {universe:recordExpected(annual.map(r=>r?.universe)),partners:Object.fromEntries([...new Set(annual.flatMap(r=>r.partners.map(p=>p.code)))].sort().map(code=>[code,recordExpected(annual.map(r=>r?.partners.find(p=>p.code===code)))]))};}
