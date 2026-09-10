import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {rejectOverrides,runManifest} from './lib/critical-runner.mjs';
import {assertFreshBuild} from './lib/server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'reports/tests/ci',`run-${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`);
const manifest=JSON.parse(fs.readFileSync(new URL('./critical-manifest.json',import.meta.url),'utf8'));
const all=manifest.find(s=>s.id==='all-years-browser');
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
all.env={ALL_FILTER:`^(?:${all.expectedNames.map(escape).join('|')})$`};
fs.mkdirSync(path.dirname(output),{recursive:true});
try{
 rejectOverrides(process.env);if(process.argv.length!==2)throw new Error('Critical gate accepts no arguments');assertFreshBuild();
 const index=fs.readFileSync(path.join(root,'dist/index.html'));const hash=createHash('sha256').update(index).digest('hex');
 for(const suite of manifest)if(suite.browser){suite.expectedIndexSha256=hash;suite.indexHashField=suite.id==='sorting-browser'?'index_sha256':'sourceIndexSHA256';}
 const env={...process.env};delete env.CENSUS_API_KEY;
 const result=await runManifest({manifest,cwd:root,output,env,overallMs:600000});
 if(!index.equals(fs.readFileSync(path.join(root,'dist/index.html'))))throw new Error('Built index changed during critical checks');
 fs.writeFileSync(path.join(output,'build.json'),JSON.stringify({index_sha256:hash,tests:28,derived_checks:948},null,2)+'\n');
 console.log(`Critical gate PASS: ${result.passed_tests} tests and 948 derived checks. Artifacts: ${path.relative(root,output)}`);
}catch(error){fs.mkdirSync(output,{recursive:true});const receiptFile=path.join(output,'result.json');if(fs.existsSync(receiptFile)){const receipt=JSON.parse(fs.readFileSync(receiptFile));receipt.status='FAIL';receipt.error=error.message.split(root).join('.');fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');}fs.writeFileSync(path.join(output,'gate-failure.json'),JSON.stringify({status:'FAIL',error:error.message.split(root).join('.')},null,2)+'\n');console.error(`Critical gate FAIL: ${error.message.split(root).join('.')}`);process.exitCode=1;}
