import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.cwd();
const {chromium}=await import(pathToFileURL(path.join(root,'node_modules/playwright/index.mjs')));
const {startStaticServer}=await import(pathToFileURL(path.join(root,'tests/e2e/lib/static-server.mjs')));
const live=process.env.BASE_URL;
const server=live?null:await startStaticServer();
const base=live?live.replace(/\/?$/,'/'):server.baseUrl;
const output=path.join(root,'reports/tests/country-alignment',live?'live':'local');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch();const results=[];const errors=[];
try{for(const code of (process.env.ALIGN_CODES?.split(',')??['7530','1220']))for(const width of (process.env.ALIGN_WIDTH?process.env.ALIGN_WIDTH.split(',').map(Number):[1280,390])){
 const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const response=await page.goto(`${base}partner/${code}?year=all&section=XVI`,{waitUntil:'networkidle'});assert.equal(response.status(),200);
 for(const exact of (process.env.ALIGN_EXACT?[true]:[false,true])){await page.getByRole('checkbox',{name:'Show exact USD in tables'}).setChecked(exact);for(const [name,selector,leftCols]of [['years','.partner-years-table',0],['groups','.partner-groups-table',1],['chapters','.partner-chapters-table',2]]){
  if(process.env.ALIGN_TABLE&&name!==process.env.ALIGN_TABLE)continue;
  const table=page.locator(selector);const result=await table.evaluate((table,leftCols)=>{const heads=[...table.querySelectorAll('thead tr:first-child > *')],row=table.querySelector('tbody tr:first-child'),cells=[...row.children];const out=heads.map((h,i)=>{const c=cells[i],hb=h.getBoundingClientRect(),cb=c.getBoundingClientRect(),money=c.querySelector('.money-cell');const mb=money?.getBoundingClientRect();return {column:i,expected:i<leftCols?'left':'center',headerAlign:getComputedStyle(h).textAlign,bodyAlign:getComputedStyle(c).textAlign,columnCenterDelta:Math.abs((hb.x+hb.width/2)-(cb.x+cb.width/2)),moneyCenterDelta:mb?Math.abs((mb.x+mb.width/2)-(cb.x+cb.width/2)):null,nowrap:money?getComputedStyle(money).whiteSpace:null,text:c.textContent};});return {columns:out,yearLines:leftCols===0?[...table.querySelectorAll('tbody tr > :first-child')].map(c=>{const r=document.createRange();r.selectNodeContents(c);return new Set([...r.getClientRects()].map(rect=>Math.round(rect.top))).size;}):[],rows:table.querySelectorAll('tbody tr').length};},leftCols);
  for(const lines of result.yearLines)assert.equal(lines,1,'Year must stay on one line');
  for(const c of result.columns){assert.equal(c.headerAlign,c.expected);assert.equal(c.bodyAlign,c.expected);assert.ok(c.columnCenterDelta<1);if(c.moneyCenterDelta!==null){assert.ok(c.moneyCenterDelta<1,JSON.stringify(c));assert.equal(c.nowrap,'nowrap');if(exact)assert.match(c.text,/^[-$\d,]+$/);}}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const region=table.locator('..');const scroll=await region.evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth}));if(width===390){assert.ok(scroll.scrollWidth>scroll.width);await region.evaluate(e=>e.scrollLeft=e.scrollWidth);assert.ok(await region.evaluate(e=>e.scrollLeft>0));const visible=await table.locator('tbody tr:first-child > :last-child .money-cell').evaluate(e=>{const b=e.getBoundingClientRect(),r=e.closest('.table-scroll').getBoundingClientRect();return b.left>=r.left&&b.right<=r.right;});assert.ok(visible);await region.evaluate(e=>e.scrollLeft=0);}
  await region.evaluate(e=>e.scrollIntoView({block:'start'}));const box=await region.boundingBox();await page.screenshot({path:path.join(output,`${code}-${width}-${exact?'exact':'compact'}-${name}.png`),clip:{x:box.x,y:box.y,width:box.width,height:Math.min(360,900-box.y)}});
  results.push({code,width,mode:exact?'exact':'compact',table:name,status:'PASS',...result,scroll});
 }}await context.close();}
 assert.deepEqual(errors,[]);
} catch(error){results.push({status:'FAIL',reason:error.message});process.exitCode=1;}finally{await browser.close();await server?.stop();fs.writeFileSync(path.join(output,process.env.ALIGN_RUN?`results-${process.env.ALIGN_RUN}.json`:'results.json'),JSON.stringify({target:live?'production':'local',index_sha256:createHash('sha256').update(fs.readFileSync('dist/index.html')).digest('hex'),results,errors},null,2)+'\n');console.log(JSON.stringify({cases:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,errors}));}
