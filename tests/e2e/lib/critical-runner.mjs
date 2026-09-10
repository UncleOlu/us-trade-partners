import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
export function rejectOverrides(env){for(const name of ['BASE_URL','ALL_FILTER','ALL_RUN','TABLE_FILTER','TABLE_RUN','ROBUST_FILTER','ROBUST_RUN','ROBUST_REPORT_DIR','TEST_REPORT_DIR','VITE_BASE_PATH'])if(Object.hasOwn(env,name))throw new Error(`Critical gate rejects external ${name}`);}
export function verifyReceipt(receipt,suite){
 assert.ok(receipt&&typeof receipt==='object'&&!Array.isArray(receipt),'Receipt must be an object');
 if(suite.kind==='integrity'){assert.equal(receipt.status,'PASS');assert.equal(receipt.checks,suite.expectedChecks);assert.ok(Number.isSafeInteger(receipt.bytes)&&receipt.bytes>0);assert.match(receipt.sha256,/^[a-f0-9]{64}$/);return;}
 assert.ok(Array.isArray(receipt.results),'Missing results array');assert.ok(suite.expectedNames.length>0,'Expected tests cannot be empty');assert.equal(receipt.results.length,suite.expectedNames.length,'Unexpected test count');
 assert.deepEqual(receipt.results.map(r=>r.name).sort(),[...suite.expectedNames].sort(),'Unexpected or duplicate test names');
 for(const result of receipt.results)assert.equal(result.status,'PASS',`${result.name}: not PASS`);
 if(suite.browser){assert.equal(receipt.target,'local','Browser target must be local');assert.ok(Array.isArray(receipt.errors),'Missing browser errors');assert.deepEqual(receipt.errors,[]);if(suite.expectedIndexSha256)assert.equal(receipt[suite.indexHashField],suite.expectedIndexSha256,'Browser receipt build hash differs');}
 for(const [key,value]of Object.entries(suite.metrics??{}))assert.equal(receipt[key],value,`Unexpected ${key}`);
 if(suite.expectedComparisons!==undefined){assert.ok(Array.isArray(receipt.checks));assert.equal(receipt.checks.length,suite.expectedComparisons);}
}
function childProcess(script,cwd,env,log,timeoutMs){return new Promise((resolve,reject)=>{
 const descriptor=fs.openSync(log,'wx');let timer,killTimer,child,timedOut=false;
 const stop=signal=>{try{process.kill(process.platform==='win32'?child.pid:-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}};
 try{child=spawn(process.execPath,[script],{cwd,env,detached:process.platform!=='win32',stdio:['ignore',descriptor,descriptor]});}catch(error){fs.closeSync(descriptor);reject(error);return;}
 fs.closeSync(descriptor);
 child.once('error',error=>{clearTimeout(timer);clearTimeout(killTimer);reject(error);});
 child.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(killTimer);if(timedOut)stop('SIGKILL');const content=fs.readFileSync(log,'utf8').split(cwd).join('.');fs.writeFileSync(log,content);resolve({code,signal,timedOut});});
 timer=setTimeout(()=>{timedOut=true;stop('SIGTERM');killTimer=setTimeout(()=>stop('SIGKILL'),1000);},timeoutMs);
});}
// Exported orchestration lets fixture processes test the same failure path without a production bypass.
export async function runManifest({manifest,cwd,output,env,overallMs=600000}){
 fs.mkdirSync(output,{recursive:false});const deadline=Date.now()+overallMs,results=[];let error;
 try{
  assert.ok(Array.isArray(manifest)&&manifest.length>0,'Empty critical manifest');
  for(const suite of manifest){const remaining=deadline-Date.now();assert.ok(remaining>0,'Overall critical timeout');const dir=path.join(output,suite.id);fs.mkdirSync(dir);const receiptFile=path.join(dir,suite.receipt);assert.ok(!fs.existsSync(receiptFile),'Receipt must be fresh');const started=Date.now();
   const processResult=await childProcess(suite.script,cwd,{...env,...suite.env,TEST_REPORT_DIR:dir},path.join(dir,'output.log'),Math.min(remaining,suite.timeoutMs));
   const record={suite:suite.id,...processResult,duration_ms:Date.now()-started,status:'FAIL'};results.push(record);
   assert.equal(processResult.timedOut,false,`${suite.id}: timeout`);assert.equal(processResult.code,0,`${suite.id}: child exited ${processResult.code}`);assert.equal(processResult.signal,null,`${suite.id}: child signal`);
   assert.ok(fs.existsSync(receiptFile),`${suite.id}: missing receipt`);const bytes=fs.readFileSync(receiptFile);const receipt=JSON.parse(bytes);verifyReceipt(receipt,suite);record.status='PASS';record.receipt_sha256=createHash('sha256').update(bytes).digest('hex');record.tests=suite.expectedNames?.length??0;record.integrity_checks=suite.expectedChecks??0;
  }
 }catch(cause){error=cause;}
 const summary={status:error?'FAIL':'PASS',results,expected_suites:manifest.length,completed_suites:results.length,passed_tests:results.filter(r=>r.status==='PASS').reduce((n,r)=>n+r.tests,0),error:error?.message??null};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(summary,null,2)+'\n');
 if(error)throw error;return summary;
}
