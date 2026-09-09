import fs from 'node:fs';
import {snapshot,years,expectedWorld,expectedPartners,expectedPartner,expectedSection,sourceHashes} from './lib/all-years-expected.mjs';
const fullPartners=Object.fromEntries(['1220','5700','EU','6022'].map(code=>[code,expectedPartner(code)]));
const section=expectedSection('XVI');
const fixture={snapshot,years,world:expectedWorld,partners:Object.fromEntries(Object.entries(fullPartners).map(([code,p])=>[code,{totals:p.totals,sectionXVI:p.groups.XVI}])),sectionXVIUniverse:section.universe};
function sorted(x){if(Array.isArray(x))return x.map(sorted);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])]));return x;}
fs.mkdirSync('tests/fixtures/all-years',{recursive:true});fs.mkdirSync('reports/tests/all-years',{recursive:true});
fs.writeFileSync('tests/fixtures/all-years/expected.json',JSON.stringify(sorted(fixture),null,2)+'\n');
fs.writeFileSync('reports/tests/all-years/expected-source-hashes.json',JSON.stringify(sorted(sourceHashes),null,2)+'\n');
console.log(JSON.stringify({sourceFiles:Object.keys(sourceHashes).length,years:years.length,partners:Object.keys(expectedPartners).length,world:expectedWorld}));
