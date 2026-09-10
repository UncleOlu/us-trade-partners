// Independent sort expectations from published annual inputs, never the UI comparator.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {REPO_ROOT,currentSnapshotId} from './server.mjs';
const root=path.join(REPO_ROOT,'data',currentSnapshotId());
export const hashes={};
export function read(file){const b=fs.readFileSync(path.join(root,file));hashes[file]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const order=read('hs_sections.json').groups.map(g=>g.id??g.section_id);
export const groupIndex=id=>order.indexOf(id);
export function expectedOrder(records,value,id,direction){
 const complete=[],missing=[];
 for(const record of records)(value(record)===null||value(record)===undefined||(typeof value(record)==='string'&&value(record).trim()==='')?missing:complete).push(record);
 const cmp=(a,b)=>{const x=value(a),y=value(b);let c;if(typeof x==='number'&&typeof y==='number')c=x<y?-1:x>y?1:0;else c=String(x).localeCompare(String(y),'en',{sensitivity:'base'});if(c)return direction==='asc'?c:-c;return String(id(a)).localeCompare(String(id(b)),'en');};
 return [...complete.sort(cmp),...missing.sort((a,b)=>String(id(a)).localeCompare(String(id(b)),'en'))];
}
export function annualRows(kind,code='6022',year=2013,section='I'){
 if(kind==='home')return read(`summary/${year}.json`).partners;
 if(kind==='section')return read('section/XVI.json').years.find(y=>y.year===year).partners;
 const p=read(`partner/${code}.json`);
 if(kind==='years')return p.years;
 const groups=p.sections.find(y=>y.year===year).groups;
 return kind==='groups'?groups:groups.find(g=>g.section_id===section).chapters;
}
export function flowValue(row,field){const x=row[field];return x&&typeof x==='object'?x.value:x;}
