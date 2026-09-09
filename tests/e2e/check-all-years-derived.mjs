import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {snapshot,years,expectedWorld,expectedPartners} from './lib/all-years-expected.mjs';
const file=process.argv[2]??`dist/derived/${snapshot}/summary-all.json`;
const bytes=fs.readFileSync(file),data=JSON.parse(bytes);let checks=0;
assert.equal(data.snapshot_id,snapshot);assert.equal(data.year,'all');assert.equal(data.view_version,'1');assert.deepEqual(data.years,years);
function check(row,expected){for(const field of ['imports','exports','balance','total_trade_value']){assert.equal(row[field].value,expected[field].value);assert.equal(row[field].status,expected[field].status);checks++;}}
check(data.world,expectedWorld);assert.equal(data.partners.length,Object.keys(expectedPartners).length);for(const p of data.partners)check(p,expectedPartners[p.code]);
const result={checks,status:'PASS',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};const output=process.argv[3]??'reports/tests/all-years/derived-integrity.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
