import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { chromium } from 'playwright';
import { startStaticServer } from './lib/static-server.mjs';
import { REPO_ROOT, currentSnapshotId } from './lib/server.mjs';
import { test as registerTest, runAll, formatResults } from './lib/harness.mjs';

const live=process.env.BASE_URL;
const liveAllowed=/invalid year|valid year|back and forward|section choice|missing reasons|hub search|home filtered|map has|product group max|exact KPI|responsive layouts/;
const filter=process.env.ROBUST_FILTER?new RegExp(process.env.ROBUST_FILTER):null;
function test(name,fn){if(live&&!liveAllowed.test(name))return;if(!filter||filter.test(name))registerTest(name,fn);}
let markdownFault=null;
const server = live?null:await startStaticServer({handleRequest(req,res){
 if(markdownFault && new URL(req.url,'http://fixture.invalid').pathname.endsWith('/methodology-content.md')){
  if(markdownFault.mode==='body'){res.writeHead(200,{'Content-Type':'text/markdown'});res.write('# Partial document\n');}
  markdownFault.arrived();return true;
 }
 return false;
}});
const browser = await chromium.launch();
const base = live?live.replace(/\/?$/,'/'):server.baseUrl;
const snapshot = currentSnapshotId();
const buildEvidence={target:live?'production':'local',expected_local_index_sha256:createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT,'dist/index.html'))).digest('hex'),index_modified:fs.statSync(path.join(REPO_ROOT,'dist/index.html')).mtime.toISOString(),snapshot};
const read = file => JSON.parse(fs.readFileSync(path.join(REPO_ROOT,'data',snapshot,file)));
const latest = read('meta.json').configured_coverage.end_year;
const reportDir = path.join(REPO_ROOT,live?'reports/tests/robustness-live':'reports/tests/robustness-after');
fs.mkdirSync(reportDir,{recursive:true});
const allPageErrors = [];
async function withPage(fn, {viewport={width:1280,height:900}, expectedError=false}={}) {
  const context=await browser.newContext({viewport,acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {const result=await fn(page);if(!expectedError)assert.deepEqual(errors,[]);return result;}
  finally {allPageErrors.push(...errors.map(error=>({expected:expectedError,error})));await context.close();}
}
async function go(page,route){const response=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200);}
async function query(page,key,value){await page.waitForFunction(([key,value])=>new URL(location.href).searchParams.get(key)===value,[key,String(value)]);}
async function changeUrl(page,query){await page.evaluate(query=>{history.pushState({},'',location.pathname+query);dispatchEvent(new PopStateEvent('popstate'));},query);}
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Timed out waiting for ${label}`)),10000);})]);}finally{clearTimeout(timer);}}
async function csv(page,button){const pending=page.waitForEvent('download');await button.click();return fs.readFileSync(await (await pending).path(),'utf8');}

test('invalid year/rank query recovery agrees with visible state',()=>withPage(async page=>{
 const requested=[];page.on('request',r=>{if(r.url().includes('/summary/'))requested.push(r.url());});
 for(const route of ['?year=abc&rank=bad','?year=0','?year=2099','partner/5700?year=abc','section/XVI?year=2099&rank=bad']){
  await go(page,route);await query(page,'year',latest);
  assert.ok(await page.locator('main h1').count());
  assert.equal(await page.getByText(/Loading\.\.\./).count(),0);
  assert.match(await page.locator('.url-notice').innerText(),/not available|Showing/);
  assert.notEqual(new URL(page.url()).searchParams.get('rank'),'bad');
 }
 assert.ok(!requested.some(url=>/\/(abc|0|2099|NaN)\.json/.test(url)));
}));

test('valid year/rank, header and hub navigation keep context',()=>withPage(async page=>{
 await go(page,'?year=2020&rank=exports');
 await page.getByRole('navigation').getByRole('link',{name:'Hub',exact:true}).click();
 await page.waitForURL(/\/hub/);
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'main-content');
 assert.equal(await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Hub',exact:true}).getAttribute('aria-current'),'page');
 await query(page,'year',2020);await query(page,'rank','exports');
 await page.locator('a[href*="partner/5700"]').click();
 await query(page,'year',2020);await query(page,'rank','exports');
 await page.reload({waitUntil:'networkidle'});await query(page,'year',2020);
 await page.getByRole('navigation').getByRole('link',{name:'Explore',exact:true}).click();
 await query(page,'year',2020);await query(page,'rank','exports');
}));

test('back and forward restore year with matching values',()=>withPage(async page=>{
 await go(page,'?year=2020&rank=exports');
 for(const year of [2019,2021]){await page.locator('#home-year-select').selectOption(String(year));await query(page,'year',year);await page.locator(`[title="$${read(`summary/${year}.json`).world.imports.value.toLocaleString('en-US')}"]`).first().waitFor();}
 await page.goBack();await query(page,'year',2019);
 await page.locator(`[title="$${read('summary/2019.json').world.imports.value.toLocaleString('en-US')}"]`).first().waitFor();
 await page.goForward();await query(page,'year',2021);
 await page.locator(`[title="$${read('summary/2021.json').world.imports.value.toLocaleString('en-US')}"]`).first().waitFor();
 await query(page,'rank','exports');
}));

test('section choice survives share/refresh and exact-value clicks are separate',()=>withPage(async page=>{
 await go(page,'partner/5700?year=2020&section=XVI');await query(page,'section','XVI');
 const sectionButton=page.getByRole('button',{name:/XVI.*(chapter|detail)|(?:chapter|detail).*XVI/i}).first();
 await sectionButton.focus();await page.keyboard.press('Enter');
 assert.equal(await sectionButton.getAttribute('aria-pressed'),'true');
 await page.reload({waitUntil:'networkidle'});await query(page,'section','XVI');
 assert.equal(await sectionButton.getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('#chapters-heading').innerText(),/XVI/);
 const exact=page.getByRole('checkbox',{name:/exact USD/i});
 await exact.check();
 assert.ok(await page.locator('table .money-cell:not(.money-cell-missing)').evaluateAll(es=>es.length>0&&es.every(e=>e.tagName!=='BUTTON'&&e.tabIndex<0)));
 const imports=read('partner/5700.json').years.find(y=>y.year===2020).imports.value;
 assert.ok(await page.getByText('$'+imports.toLocaleString('en-US'),{exact:true}).count());
 await query(page,'section','XVI');
 await go(page,'partner/5700?year=2020&section=INVALID');
 await page.waitForFunction(()=>new URL(location.href).searchParams.get('section')!=='INVALID');
 assert.ok(await page.locator('main h1').count());
}));

for(const [name,response] of [['404',{status:404,body:'missing'}],['500',{status:500,body:'failed'}],['invalid JSON',{status:200,contentType:'application/json',body:'not json'}],['wrong shape',{status:200,contentType:'application/json',body:'{}'}],['wrong snapshot',{status:200,contentType:'application/json',body:JSON.stringify({...read('partner/5700.json'),snapshot_id:'20000101T000000Z-0123456789ab'})}]]){
 test(`data failure ${name}: visible recovery restores pinned snapshot`,()=>withPage(async page=>{
  let broken=true;
  await page.route('**/data/**/partner/5700.json',r=>broken?r.fulfill(response):r.continue());
  await go(page,'partner/5700?year=2020&section=XVI');
  await page.getByRole('alert').waitFor();
  assert.ok(await page.getByRole('navigation').count());
  const recovery=page.getByRole('button',{name:/retry|reload/i}).first();assert.ok(await recovery.count());
  broken=false;await recovery.click();
  await page.locator('main h1').filter({hasText:/China/i}).waitFor();
  await query(page,'year',2020);
  assert.ok((await page.locator('body').innerText()).includes(snapshot));
 }));
}

test('data timeout is bounded and retry restores the page',()=>withPage(async page=>{
 await page.clock.install();
 let blocked=true,release;const gate=new Promise(resolve=>{release=resolve;});
 let arrived;const received=new Promise(resolve=>{arrived=resolve;});
 await page.route('**/data/**/partner/5700.json',async route=>{
  if(blocked){arrived();await gate;try{await route.abort('failed');}catch{}}
  else await route.continue();
 });
 await page.goto(base+'partner/5700?year=2020',{waitUntil:'domcontentloaded'});
 await bounded(received,'received');await page.clock.fastForward(31000);
 await page.getByRole('alert').waitFor();
 assert.match(await page.getByRole('alert').innerText(),/timed out|timeout|too long|30 seconds/i);
 blocked=false;release();
 await page.getByRole('button',{name:/retry|reload/i}).first().click();
 await page.locator('main h1').filter({hasText:/China/i}).waitFor();await query(page,'year',2020);
}));

for(const mode of ['headers','body']) test(`methodology ${mode} timeout is bounded and retry restores content`,()=>withPage(async page=>{
 await page.clock.install();
 let arrived;const received=new Promise(resolve=>{arrived=resolve;});markdownFault={mode,arrived};
 try{
  await page.goto(base+'methodology?year=2020&rank=exports',{waitUntil:'domcontentloaded'});
  await bounded(received,'methodology fixture request');await page.clock.fastForward(31000);
  await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/timed out|timeout|too long|30 seconds/i);
  markdownFault=null;await page.getByRole('button',{name:/retry|reload/i}).first().click();
  await page.getByText('What this site shows',{exact:true}).waitFor();await query(page,'year',2020);await query(page,'rank','exports');
 }finally{markdownFault=null;}
}));

test('methodology normal and boundary recovery links keep context',()=>withPage(async page=>{
 await go(page,'methodology?year=2020&rank=exports');
 const home=page.getByRole('link',{name:'home page',exact:true});await home.waitFor();
 const normalUrl=new URL(await home.getAttribute('href'),base);assert.equal(normalUrl.searchParams.get('year'),'2020');assert.equal(normalUrl.searchParams.get('rank'),'exports');
 await page.route('**/assets/HubPage-*.js',r=>r.abort('failed'));
 await go(page,'hub?year=2020&rank=exports');await page.getByRole('alert').waitFor();
 const recovery=page.getByRole('alert').getByRole('link');assert.ok(await recovery.count());
 const href=await recovery.first().getAttribute('href');const url=new URL(href,base);assert.equal(url.searchParams.get('year'),'2020');assert.equal(url.searchParams.get('rank'),'exports');
 await page.route('**/data/**/partner/5700.json',r=>r.fulfill({status:404,body:'missing'}));
 await go(page,'partner/5700?year=2020&rank=exports');await page.getByRole('alert').waitFor();
 const dataRecovery=page.getByRole('alert').getByRole('link');assert.ok(await dataRecovery.count());
 const dataUrl=new URL(await dataRecovery.first().getAttribute('href'),base);assert.equal(dataUrl.searchParams.get('year'),'2020');assert.equal(dataUrl.searchParams.get('rank'),'exports');
},{expectedError:true}));

test('failed lazy page shows recovery rather than a blank app',()=>withPage(async page=>{
 let fail=true;await page.route('**/assets/HubPage-*.js',r=>fail?r.abort('failed'):r.continue());
 await go(page,'hub?year=2020');await page.getByRole('alert').waitFor();
 fail=false;await page.getByRole('button',{name:/retry|reload/i}).first().click();
 await page.locator('main h1').filter({hasText:'Browse partners and products'}).waitFor();await query(page,'year',2020);
},{expectedError:true}));

for(const mode of ['select','slider']) test(`${mode} stays mounted and focused during rapid year changes; latest response wins`,()=>withPage(async page=>{
 const firstYear=mode==='select'?2019:2013;const secondYear=mode==='select'?2020:2014;
 let releaseFirst,releaseSecond,firstDone,secondDone,firstArrived,secondArrived;
 const gateFirst=new Promise(r=>{releaseFirst=r;});const gateSecond=new Promise(r=>{releaseSecond=r;});
 const doneFirst=new Promise(r=>{firstDone=r;});const doneSecond=new Promise(r=>{secondDone=r;});
 const gotFirst=new Promise(r=>{firstArrived=r;});const gotSecond=new Promise(r=>{secondArrived=r;});
 await page.route(`**/summary/${firstYear}.json`,async route=>{firstArrived();await gateFirst;try{await route.fulfill({json:read(`summary/${firstYear}.json`)});}catch{}finally{firstDone();}});
 await page.route(`**/summary/${secondYear}.json`,async route=>{secondArrived();await gateSecond;try{await route.fulfill({json:read(`summary/${secondYear}.json`)});}catch{}finally{secondDone();}});
 await go(page,'?year=2025');
 const select=await page.locator('#home-year-select').elementHandle();const slider=await page.locator('#year-slider').elementHandle();
 const control=page.locator(mode==='select'?'#home-year-select':'#year-slider');await control.focus();
 if(mode==='select')await control.selectOption(String(firstYear));else await page.keyboard.press('Home');
 await bounded(gotFirst,'gotFirst');
 assert.ok(await select.evaluate(e=>e.isConnected));assert.ok(await slider.evaluate(e=>e.isConnected));
 assert.equal(await control.evaluate(e=>document.activeElement===e),true);
 if(mode==='select')await control.selectOption(String(secondYear));else await page.keyboard.press('ArrowRight');
 await bounded(gotSecond,'gotSecond');
 assert.ok(await select.evaluate(e=>e.isConnected));assert.ok(await slider.evaluate(e=>e.isConnected));
 assert.equal(await control.evaluate(e=>document.activeElement===e),true);
 const oldTitle='$'+read('summary/2025.json').world.imports.value.toLocaleString('en-US');
 assert.equal(await page.locator(`[title="${oldTitle}"]`).count(),0);
 releaseSecond();await bounded(doneSecond,'doneSecond');
 const title='$'+read(`summary/${secondYear}.json`).world.imports.value.toLocaleString('en-US');
 await page.locator(`[title="${title}"]`).first().waitFor();
 releaseFirst();await bounded(doneFirst,'doneFirst');
 await query(page,'year',secondYear);assert.ok(await page.locator(`[title="${title}"]`).count());
}));

test('missing reasons are available by tap and keyboard',()=>withPage(async page=>{
 await go(page,'partner/6022?year=2023');
 const missing=page.locator('button.money-cell-missing').first();await missing.waitFor();
 const reason=await missing.getAttribute('title');assert.ok(reason);
 await missing.click();assert.equal(await missing.getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('.missing-reason').first().innerText(),reason);
 await missing.focus();await page.keyboard.press('Enter');assert.equal(await missing.getAttribute('aria-expanded'),'false');
 await page.keyboard.press('Space');assert.equal(await missing.getAttribute('aria-expanded'),'true');
 const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(layout.scroll<=layout.width+1);
},{viewport:{width:320,height:844}}));

test('hub search keeps all partners and sections reachable',()=>withPage(async page=>{
 await go(page,'hub?year=2020&rank=exports');
 const search=page.getByRole('searchbox',{name:'Search partners',exact:true});await search.fill('1610');
 const partner=page.locator('a[href*="partner/1610"]');assert.equal(await partner.count(),1);
 assert.ok((await partner.getAttribute('href')).includes('year=2020'));
 await search.fill('');assert.equal(await page.locator('a[href*="partner/"]').count(),236);
 assert.equal(await page.locator('a[href*="section/"]').count(),22);
 const products=page.getByRole('searchbox',{name:'Search product groups',exact:true});
 for(const text of ['machinery','television','84']){
  await products.fill(text);assert.ok(await page.locator('a[href*="section/XVI"]').count());
  assert.match(await page.locator('#hub-sections').innerText(),/Showing \d+ of 22 product groups/);
 }
 await products.fill('no such product qwerty');
 assert.equal(await page.locator('a[href*="section/"]').count(),0);
 await page.getByRole('button',{name:'Clear product search',exact:true}).click();
 assert.equal(await page.locator('a[href*="section/"]').count(),22);
 await search.fill('no such partner qwerty');
 assert.equal(await page.locator('a[href*="partner/"]').count(),0);
 await page.getByRole('button',{name:'Clear search',exact:true}).click();
 assert.equal(await page.locator('a[href*="partner/"]').count(),236);
}));

test('home filtered search preserves totals and full-export scope',()=>withPage(async page=>{
 await go(page,'?year=2025');
 assert.equal(await page.locator('tbody tr').count(),25);
 const world=page.getByRole('region',{name:/World total/i});const before=await world.innerText();
 await page.getByRole('searchbox',{name:/partner/i}).fill('1610');
 assert.equal(await page.locator('tbody tr').count(),1);assert.equal(await world.innerText(),before);
 const text=await csv(page,page.getByRole('button',{name:/Download all partners CSV/i}));
 assert.equal(text.trim().split('\n').length,read('summary/2025.json').partners.length+1);
 assert.ok(text.includes('5700')&&text.includes('1610'));
 await page.getByRole('searchbox',{name:/partner/i}).fill('no such partner 12345');
 assert.equal(await page.locator('tbody tr').count(),0);
 assert.ok((await page.locator('main').innerText()).match(/no.*(match|partner)|0 of/i));
}));

test('map has one tab stop, arrow navigation, escape and keyboard selection',()=>withPage(async page=>{
 await go(page,'?year=2020');
 const paths=page.locator('svg [role="button"]');await paths.first().waitFor();
 assert.equal(await page.locator('svg [role="button"][tabindex="0"]').count(),1);
 const current=page.locator('svg [role="button"][tabindex="0"]');await current.focus();
 const first=await current.getAttribute('aria-label');await page.keyboard.press('ArrowRight');
 assert.notEqual(await page.locator('svg [role="button"][tabindex="0"]').getAttribute('aria-label'),first);
 assert.ok((await page.locator('.world-map-readout').innerText()).match(/imports/i));
 await page.keyboard.press('End');const last=await page.locator('svg [role="button"][tabindex="0"]').getAttribute('aria-label');
 await page.keyboard.press('Home');assert.notEqual(await page.locator('svg [role="button"][tabindex="0"]').getAttribute('aria-label'),last);
 await page.keyboard.press('Escape');assert.ok((await page.locator('.world-map-readout').innerText()).match(/Reading the map/i));
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.matches('svg [role="button"]')),false);
 await page.locator('svg [role="button"][tabindex="0"]').focus();await page.keyboard.press('Enter');
 await page.waitForURL(/partner\//);await query(page,'year',2020);
}));

test('atlas failure offers retry and keeps table usable',()=>withPage(async page=>{
 let fail=true;await page.route('**/atlas/countries-110m.json',r=>fail?r.fulfill({status:503,body:'unavailable'}):r.continue());
 await go(page,'?year=2020');await page.getByRole('button',{name:'Retry map',exact:true}).waitFor();
 assert.equal(await page.locator('tbody tr').count(),25);
 fail=false;await page.getByRole('button',{name:'Retry map',exact:true}).click();
 await page.locator('svg [role="button"][tabindex="0"]').waitFor();
}));

test('exact KPI values fit the card and keep keyboard focus',()=>withPage(async page=>{
 const checks=[];
 for(const width of [320,390,640,1280]){
  await page.setViewportSize({width,height:844});await go(page,'?year=2025');
  const amount=page.getByRole('region',{name:'World total',exact:true}).locator('button.money-value').first();
  const initial=await amount.evaluate(e=>e.closest('.stat-card').getBoundingClientRect().width);
  await amount.focus();await page.keyboard.press('Enter');
  assert.equal(await amount.getAttribute('aria-pressed'),'true');assert.equal(await amount.evaluate(e=>document.activeElement===e),true);
  assert.equal(await amount.innerText(),'$'+read('summary/2025.json').world.imports.value.toLocaleString('en-US'));
  const geometry=await amount.evaluate(e=>{const b=e.getBoundingClientRect();const c=e.closest('.stat-card').getBoundingClientRect();return {left:b.left,right:b.right,cardLeft:c.left,cardRight:c.right};});
  assert.ok(geometry.left>=geometry.cardLeft&&geometry.right<=geometry.cardRight,JSON.stringify({width,geometry}));
  await page.keyboard.press('Enter');assert.equal(await amount.getAttribute('aria-pressed'),'false');assert.equal(await amount.evaluate(e=>document.activeElement===e),true);
  assert.ok(Math.abs(await amount.evaluate(e=>e.closest('.stat-card').getBoundingClientRect().width)-initial)<1);
  checks.push({width,...geometry});
 }
 return checks;
}));

test('product group max scroll reveals the full last numeric column',()=>withPage(async page=>{
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});await go(page,'partner/5700?year=2025');
  const region=page.getByRole('region',{name:'Product groups',exact:true});
  const cell=region.locator('tbody tr').first().locator('td').last();await cell.scrollIntoViewIfNeeded();
  await region.evaluate(e=>{e.scrollLeft=e.scrollWidth;});
  const result=await cell.evaluate(cell=>{
   const c=cell.getBoundingClientRect();const r=cell.closest('.table-scroll').getBoundingClientRect();
   const points=[c.left+2,(c.left+c.right)/2,c.right-2];
   return {cell:{left:c.left,right:c.right,width:c.width},region:{left:r.left,right:r.right,width:r.width},uncovered:points.map(x=>document.elementFromPoint(x,(c.top+c.bottom)/2)?.closest('td')===cell)};
  });
  assert.ok(result.cell.left>=result.region.left-1&&result.cell.right<=result.region.right+1,JSON.stringify({width,...result}));
  assert.ok(result.uncovered.every(Boolean),JSON.stringify({width,...result}));
 }
}));

test('responsive layouts, focus and keyboard table scroll',()=>withPage(async page=>{
 for(const [name,width] of [['desktop',1280],['mobile',390],['narrow',320],['reflow',640]]){
  await page.setViewportSize({width,height:900});
  for(const [nameRoute,route] of [['home','?year=2025'],['partner','partner/5700?year=2025'],['hub','hub?year=2025'],['section','section/XVI?year=2025'],['methodology','methodology']]){
   await go(page,route);
   const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify({name,nameRoute,dimensions}));
   if(nameRoute==='partner'&&width===320){
    const region=page.locator('.table-scroll').first();assert.equal(await region.getAttribute('tabindex'),'0');
    assert.ok(await region.getAttribute('aria-label'));
    await region.focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(e=>e.scrollLeft>0,await region.elementHandle());
    await page.screenshot({path:path.join(reportDir,'narrow-partner-table-focus.png')});
    await region.evaluate(e=>{e.scrollLeft=0;});
    await page.evaluate(()=>window.scrollTo(0,0));
   }
   await page.screenshot({path:path.join(reportDir,`${name}-${nameRoute}-viewport.png`)});
   if(nameRoute==='home'&&(name==='desktop'||name==='mobile'))await page.locator('.home-map-pane').screenshot({path:path.join(reportDir,`${name}-map.png`)});
   if(name==='desktop'||name==='mobile')await page.screenshot({path:path.join(reportDir,`${name}-${nameRoute}.png`),fullPage:true});
  }
 }
 await go(page,'?year=2020');await page.keyboard.press('Tab');
 assert.match(await page.evaluate(()=>document.activeElement?.textContent||''),/skip/i);
 await page.keyboard.press('Enter');assert.ok(await page.evaluate(()=>document.activeElement?.matches('main, main *')));
}));

try{const results=await runAll();assert.ok(results.length,'No tests selected');const resultName=process.env.ROBUST_RUN?`results-${process.env.ROBUST_RUN.replace(/[^a-z0-9-]/gi,'')}.json`:'results.json';fs.writeFileSync(path.join(reportDir,resultName),JSON.stringify({build:buildEvidence,results,pageErrors:allPageErrors},null,2)+'\n');console.log(formatResults(results));process.exitCode=results.some(r=>r.status!=='PASS')?1:0;}
finally{await browser.close();await server?.stop();}
