import { chromium } from 'playwright';
import fs from 'node:fs';
const browser=await chromium.launch();
const base='https://uncleolu.github.io/us-trade-partners/';
const results=[];
async function observe(name,route,setup,act){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  if(setup)await setup(page);
  await page.goto(base+route,{waitUntil:'networkidle'});
  if(act)await act(page);
  results.push({name,url:page.url(),main:(await page.locator('main').innerText()).slice(0,1400),errors,details:await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,title:document.title,yearSelect:document.querySelector('#year-select, #section-year-select')?.value,rank:document.querySelector('#rank-field, #section-rank-field')?.value,focused:document.activeElement?.outerHTML.slice(0,240),smallControls:[...document.querySelectorAll('button,input,select,nav a')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<24}).slice(0,8).map(e=>({text:e.textContent.slice(0,40),height:e.getBoundingClientRect().height})),mapTabStops:document.querySelectorAll('svg [tabindex="0"]').length}))});
 }catch(e){results.push({name,error:e.message,errors});}
 finally{await context.close();}
}
try{
 for(const q of ['abc','0','2099'])await observe('home invalid year '+q,'?year='+q);
 await observe('partner invalid year','partner/5700/?year=abc');
 await observe('section invalid year and rank','section/XVI/?year=2099&rank=oops');
 for(const [name,response] of [['missing snapshot',{status:404,body:'missing'}],['invalid JSON',{status:200,body:'not json',contentType:'application/json'}],['wrong JSON shape',{status:200,body:'{}',contentType:'application/json'}]])await observe(name,'partner/5700/?year=2020',p=>p.route('**/data/**/partner/5700.json',r=>r.fulfill(response)));
 await observe('header loses route context','?year=2020&rank=exports',null,async p=>{await p.locator('nav a').filter({hasText:'Hub'}).click();await p.waitForLoadState('networkidle');});
 await observe('home control sizes and tab stops','?year=2020');
 await observe('partner group selection refresh','partner/5700/?year=2020',null,async p=>{const row=p.locator('tr').filter({has:p.locator('td:first-child',{hasText:/^XVI$/})});await row.click();const before=await p.locator('tr.selected-row td').first().innerText();await p.reload({waitUntil:'networkidle'});const after=await p.locator('tr.selected-row td').first().innerText();results.push({name:'group refresh detail',before,after,url:p.url()});});
}finally{await browser.close();}
fs.writeFileSync('reports/tests/robustness-before/observations.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({name:r.name,url:r.url,errors:r.errors,error:r.error,main:r.main?.slice(0,100),before:r.before,after:r.after,details:r.details})),null,2));
