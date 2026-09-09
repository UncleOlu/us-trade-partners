import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {startStaticServer} from './lib/static-server.mjs';
import {test as registerTest,runAll,formatResults} from './lib/harness.mjs';
import {snapshot,years,expectedWorld,expectedPartners,expectedPartner,expectedSection,readAnnual} from './lib/all-years-expected.mjs';
const live=process.env.BASE_URL;
const filter=process.env.ALL_FILTER?new RegExp(process.env.ALL_FILTER):null;
function test(name,fn){if(!filter||filter.test(name))registerTest(name,fn);}
const server=live?null:await startStaticServer();
const base=live?live.replace(/\/?$/,'/'):server.baseUrl;
const report=`reports/tests/all-years/${live?'live':'local'}`;fs.mkdirSync(report,{recursive:true});
const browser=await chromium.launch();
const errors=[];
async function pageTest(fn,viewport={width:1280,height:900}){const context=await browser.newContext({viewport,acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(10000);const own=[];page.on('pageerror',e=>own.push(e.message));page.on('console',m=>{if(m.type()==='error')own.push(m.text());});try{const out=await fn(page);assert.deepEqual(own,[]);return out;}finally{errors.push(...own);await context.close();}}
async function go(page,route){const r=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(r.status(),200);}
const exact=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
async function totals(region,expected){for(const key of ['imports','exports','balance','total_trade_value']){const cell=region.locator(`.stat-${key}`);if(expected[key].value===null)assert.match(await cell.innerText(),/absent/);else assert.equal(await cell.locator('[title]').getAttribute('title'),exact(expected[key].value));}}
async function csv(page,button){const pending=page.waitForEvent('download');await button.click();const d=await pending;const text=fs.readFileSync(await d.path(),'utf8');return {name:d.suggestedFilename(),text,rows:parseCsv(text)};}
function parseCsv(text){const rows=[];let row=[],value='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){value+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(value);value='';}else if(c==='\n'&&!quote){row.push(value.replace(/\r$/,''));rows.push(row);row=[];value='';}else value+=c;}const headers=rows.shift();return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));}
function saveCsvEvidence(name,download){fs.writeFileSync(path.join(report,name.replace(/\.csv$/,'.json')),JSON.stringify({filename:download.name,sha256:createHash('sha256').update(download.text).digest('hex'),rows:download.rows.length,headers:Object.keys(download.rows[0]??{}),example:download.rows[0]},null,2)+'\n');}
function periodRows(rows){for(const r of rows){assert.equal(r.period,'all');assert.equal(r.start_year,'2013');assert.equal(r.end_year,'2025');}}
function dataRow(row,expected){for(const field of ['imports','exports','balance','total_trade_value']){const valueKey=field in row?field:`${field}_usd`;if(!(valueKey in row))continue;assert.equal(row[valueKey],expected[field].value===null?'':String(expected[field].value),field);assert.equal(row[`${field}_status`],expected[field].status,`${field}_status`);}}
async function allQuery(page){assert.equal(new URL(page.url()).searchParams.get('year'),'all');}

test('all-years home uses derived summary, fixed world totals and complete CSV scope',()=>pageTest(async page=>{
 const requests=[];page.on('request',r=>requests.push(r.url()));await go(page,'?year=all&rank=imports');await allQuery(page);
 assert.equal(await page.locator('#home-year-select').inputValue(),'all');assert.equal(await page.locator('tbody tr').count(),25);
 const world=page.getByRole('region',{name:'World total',exact:true});await totals(world,expectedWorld);const before=await world.innerText();
 assert.ok(requests.some(url=>url.endsWith(`/derived/${snapshot}/summary-all.json`)));
 assert.ok(!requests.some(url=>/\/summary\/20\d\d\.json/.test(url)));
 await page.locator('#partner-search').fill('6022');assert.equal(await page.locator('tbody tr').count(),1);assert.match(await page.locator('tbody tr').innerText(),/Not ranked/);assert.equal(await world.innerText(),before);
 const download=await csv(page,page.getByRole('button',{name:'Download all partners CSV',exact:true}));periodRows(download.rows);assert.equal(download.rows.length,236);
 for(const row of download.rows){const code=row.code??row.partner_code;assert.ok(expectedPartners[code],code);dataRow(row,expectedPartners[code]);}
 saveCsvEvidence('home-all.csv',download);
 await page.locator('#partner-search').fill('');await page.getByRole('button',{name:/Show all/}).click();assert.equal(await page.locator('tbody tr').count(),236);
 const rows=await page.locator('tbody tr').allTextContents();assert.equal(rows.filter(r=>r.includes('Not ranked')).length,7);assert.ok(rows.slice(-7).every(r=>r.includes('Not ranked')));
}));
test('all period survives Hub partner section refresh navigation and browser Back',()=>pageTest(async page=>{
 await go(page,'?year=all&rank=exports');await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Hub',exact:true}).click();await page.waitForURL(/\/hub/);await allQuery(page);
 assert.equal(await page.locator('#hub-year-select').inputValue(),'all');await page.locator('a[href*="partner/1220"]').click();await page.waitForURL(/partner\/1220/);await allQuery(page);await page.reload({waitUntil:'networkidle'});await allQuery(page);
 await page.goBack({waitUntil:'networkidle'});await allQuery(page);await page.locator('a[href*="section/XVI?"]').click();await page.waitForURL(/section\/XVI/);await allQuery(page);await page.reload({waitUntil:'networkidle'});await allQuery(page);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Explore',exact:true}).click();await allQuery(page);assert.equal(new URL(page.url()).searchParams.get('rank'),'exports');
 await page.locator('#home-year-select').selectOption('2025');await page.waitForFunction(()=>new URL(location.href).searchParams.get('year')==='2025');await page.goBack({waitUntil:'networkidle'});await allQuery(page);await totals(page.getByRole('region',{name:'World total',exact:true}),expectedWorld);
}));
test('all-years map shows summed country values and preserves period on selection',()=>pageTest(async page=>{
 await go(page,'?year=all');const map=page.getByRole('group',{name:'World map of US goods trade balance for All years (2013-2025)',exact:true});assert.equal(await map.count(),1);
 const country=map.locator('[role="button"][aria-label^="China" i]');await country.focus();const readout=page.locator('.world-map-readout');for(const f of ['imports','exports','balance'])assert.ok((await readout.innerText()).includes(exact(expectedPartners['5700'][f].value)));await country.press('Enter');await page.waitForURL(/partner\/5700/);await allQuery(page);
}));
test('all-years partner totals and group chapter CSVs match independent sums; annual trend retained',()=>pageTest(async page=>{
 for(const code of ['1220','5700','EU','6022']){await go(page,`partner/${code}?year=all&section=XVI`);await allQuery(page);const expected=expectedPartner(code);await totals(page.getByRole('region',{name:'Partner totals',exact:true}),expected.totals);
 assert.equal(await page.locator('.table-scroll[aria-label="Trade by year"] tbody tr').count(),13);
 const annual=await csv(page,page.locator('section:has(#years-table-heading)').getByRole('button',{name:/Download/}));assert.deepEqual(annual.rows.map(r=>Number(r.year)),years);
 const group=await csv(page,page.locator('section:has(#groups-heading)').getByRole('button',{name:/Download/}));periodRows(group.rows);assert.equal(group.rows.length,22);for(const r of group.rows)dataRow(r,expected.groups[r.section_id??r.section]);
 const chapter=await csv(page,page.locator('section:has(#chapters-heading)').getByRole('button',{name:/Download/}));periodRows(chapter.rows);assert.equal(chapter.rows.length,2);for(const r of chapter.rows)dataRow(r,expected.groups.XVI.chapters[r.chapter??r.chapter_code]);
 saveCsvEvidence(`partner-${code}-groups-all.csv`,group);saveCsvEvidence(`partner-${code}-chapters-all.csv`,chapter);
 await page.reload({waitUntil:'networkidle'});await allQuery(page);assert.equal(new URL(page.url()).searchParams.get('section'),'XVI');
 }
}));
test('all-years section retains annual trend and one table with exact period CSV',()=>pageTest(async page=>{
 await go(page,'section/XVI?year=all&rank=exports');const expected=expectedSection('XVI');await totals(page.locator('.world-total-card'),expected.universe);assert.equal(await page.locator('table').count(),1);
 const data=await csv(page,page.getByRole('button',{name:'Download CSV',exact:true}));periodRows(data.rows);assert.equal(data.rows.length,236);for(const r of data.rows)dataRow(r,expected.partners[r.code??r.partner_code]);saveCsvEvidence('section-XVI-all.csv',data);
 const circles=page.locator('.recharts-line-dots');assert.equal(await circles.count(),2);for(const group of await circles.all())assert.equal(await group.locator('circle').count(),13);
 await page.reload({waitUntil:'networkidle'});await allQuery(page);
}));
if(!live)test('missing whole annual record retains configured range and marks aggregate incomplete',()=>pageTest(async page=>{
 for(const [file,route] of [['partner/1220.json','partner/1220'],['section/XVI.json','section/XVI']]){
  const data=readAnnual(file);data.years=data.years.filter(r=>r.year!==2013);
  await page.route(`**/data/${snapshot}/${file}`,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}));
  await go(page,`${route}?year=all`);await allQuery(page);
  assert.match(await page.locator('main').innerText(),/All years \(2013-2025\)/);
  const totalsRegion=page.locator('.world-total-card');
  for(const key of ['imports','exports','balance','total_trade_value'])assert.match(await totalsRegion.locator(`.stat-${key}`).innerText(),/absent/);
  await page.unroute(`**/data/${snapshot}/${file}`);
 }
}));
test('home rank and money align centrally; partner names align left and mobile table scrolls',()=>pageTest(async page=>{
 const geometry=[];
 for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});await go(page,'?year=all');const table=page.locator('table');const align=await table.evaluate(t=>({head:[...t.querySelectorAll('thead th')].map(e=>getComputedStyle(e).textAlign),body:[...t.querySelectorAll('tbody tr:first-child > th, tbody tr:first-child > td')].map(e=>getComputedStyle(e).textAlign)}));assert.equal(align.head[0],'center');assert.equal(align.body[0],'center');assert.equal(align.head[1],'left');assert.equal(align.body[1],'left');for(const index of [2,3,4,5]){assert.equal(align.head[index],'center');assert.equal(align.body[index],'center');}
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const region=page.locator('.table-scroll');if(width<500){assert.ok(await region.evaluate(e=>e.scrollWidth>e.clientWidth));await region.evaluate(e=>e.scrollLeft=e.scrollWidth);assert.ok(await region.evaluate(e=>e.scrollLeft>0));await region.evaluate(e=>e.scrollLeft=0);}
 geometry.push({width,...align});await page.screenshot({path:path.join(report,`home-${width}-viewport.png`)});if(width!==320)await page.screenshot({path:path.join(report,`home-${width}-full.png`),fullPage:true});
 }
 return geometry;
}));
test('all-years period control text fits home and Hub at desktop and mobile widths',()=>pageTest(async page=>{
 const results=[];
 for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});for(const [name,route,id] of [['home','','home-year-select'],['hub','hub','hub-year-select']]){
  await go(page,`${route}?year=all`);const geometry=await page.locator(`#${id}`).evaluate(e=>{const style=getComputedStyle(e),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=style.font;const text=e.selectedOptions[0].textContent;return {text,textWidth:ctx.measureText(text).width,width:e.clientWidth,padding:parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)};});
  assert.ok(geometry.width>=geometry.textWidth+geometry.padding+18,JSON.stringify({name,width,...geometry}));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));results.push({name,width,...geometry});await page.screenshot({path:path.join(report,`${name}-${width}-viewport.png`)});
  if(name==='home'){const table=page.locator('.table-scroll');await table.evaluate(e=>e.scrollIntoView({block:'start'}));const box=await table.boundingBox();await page.screenshot({path:path.join(report,`home-table-${width}.png`),clip:{x:box.x,y:box.y,width:box.width,height:Math.min(400,900-box.y)}});}
 }}return results;
}));
test('all-years Hub partner section and methodology screenshots show period context',()=>pageTest(async page=>{for(const width of [1280,390]){await page.setViewportSize({width,height:900});for(const [name,route] of [['hub','hub'],['partner','partner/1220'],['section','section/XVI'],['methodology','methodology']]){await go(page,`${route}?year=all`);await allQuery(page);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(report,`${name}-${width}-viewport.png`)});}}}));
try{const results=await runAll();console.log(formatResults(results));fs.writeFileSync(path.join(report,process.env.ALL_RUN?`results-${process.env.ALL_RUN}.json`:'results.json'),JSON.stringify({sourceIndexSHA256:createHash('sha256').update(fs.readFileSync('dist/index.html')).digest('hex'),target:live?'production':'local',results,errors},null,2)+'\n');if(results.some(r=>r.status!=='PASS'))process.exitCode=1;}finally{await browser.close();if(server)await server.stop();}
