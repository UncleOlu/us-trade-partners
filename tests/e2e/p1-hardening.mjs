import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './lib/static-server.mjs';
import {test,runAll,formatResults} from './lib/harness.mjs';
import {annualRows,expectedOrder,flowValue,read} from './lib/sorting-expected.mjs';
import {years as coverageYears,expectedPartners} from './lib/all-years-expected.mjs';
const output=process.env.TEST_REPORT_DIR??'reports/tests/p1';fs.mkdirSync(output,{recursive:true});
const server=await startStaticServer(),browser=await chromium.launch();
// Independent allowed-column examples: these keys belong to other tables, not these targets.
const tables=[
 {id:'home',route:'?year=all',selector:'.home-ranking-table',bad:'year',code:undefined,key:'code'},
 {id:'section',route:'section/XVI?year=all',selector:'.section-ranking-table',bad:'chapter',key:'code'},
 {id:'years',route:'partner/6022?year=all&section=I',selector:'.partner-years-table',bad:'name',code:'6022',key:'year'},
 {id:'groups',route:'partner/7530?year=all&section=I',selector:'.partner-groups-table',bad:'balance',code:'7530',key:'section_id'},
 {id:'chapters',route:'partner/7530?year=all&section=I',selector:'.partner-chapters-table',bad:'kind',code:'7530',key:'chapter'},
];
async function pageTest(fn){const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));try{await fn(page);assert.deepEqual(errors,[]);}finally{await page.close();}}
const visit=async(page,route)=>assert.equal((await page.goto(server.baseUrl+route,{waitUntil:'networkidle'})).status(),200);
async function ids(table,c){if(c.key==='code')return table.locator('tbody a[href*="/partner/"]').evaluateAll(a=>a.map(e=>e.getAttribute('href').match(/partner\/([^/?]+)/)[1]));if(c.id==='groups')return table.locator('tbody .group-button').evaluateAll(a=>a.map(e=>e.textContent.split(':')[0].trim()));return table.locator('tbody tr > :first-child').evaluateAll(a=>a.map(e=>e.textContent.replace('*','').trim()));}
test('each table rejects another table column and preserves all-years context on refresh',()=>pageTest(async page=>{
 for(const c of tables){await visit(page,c.route+`&${c.id}_sort=${c.bad}&${c.id}_dir=asc`);const params=new URL(page.url()).searchParams;assert.equal(params.has(`${c.id}_sort`),false,c.id);assert.equal(params.has(`${c.id}_dir`),false,c.id);assert.equal(params.get('year'),'all');assert.match(await page.locator('.url-notice').innerText(),/sort.*not available/i);await page.reload({waitUntil:'networkidle'});assert.equal(new URL(page.url()).searchParams.get('year'),'all');assert.equal(await page.locator(c.selector+' th[aria-sort="ascending"],'+c.selector+' th[aria-sort="descending"]').count(),1);}
}));
test('each table rejects case-sensitive invalid directions without discarding a valid column',()=>pageTest(async page=>{
 for(const c of tables){await visit(page,c.route+`&${c.id}_sort=imports&${c.id}_dir=ASC`);const params=new URL(page.url()).searchParams;assert.equal(params.get(`${c.id}_sort`),'imports');assert.equal(params.has(`${c.id}_dir`),false);assert.equal(params.get('year'),'all');assert.match(await page.locator('.url-notice').innerText(),/direction.*not available/i);}
}));
test('Space sorts all five tables both ways using exact independent values and retains focus',()=>pageTest(async page=>{
 for(const c of tables){await visit(page,c.route.replace('year=all','year=2013')+`&${c.id}_sort=imports&${c.id}_dir=desc`);if(c.id==='home'||c.id==='section')await page.getByRole('button',{name:/Show all/}).click();const table=page.locator(c.selector),button=table.getByRole('button',{name:/^Imports: sort /});await button.focus();for(const direction of ['asc','desc']){await button.press('Space');assert.equal(await button.evaluate(e=>document.activeElement===e),true);assert.equal(await button.locator('..').getAttribute('aria-sort'),direction==='asc'?'ascending':'descending');const rows=annualRows(c.id,c.code,2013,'I'),expected=expectedOrder(rows,r=>flowValue(r,'imports'),r=>r[c.key],direction).map(r=>String(r[c.key]));assert.deepEqual(await ids(table,c),expected);assert.equal(new URL(page.url()).searchParams.get(`${c.id}_dir`),direction);}}
}));
test('home and both Hub searches survive direct entry refresh and browser Back independently',()=>pageTest(async page=>{
 for(const [route,id,key,initial,next]of [['?year=all&home_q=Canada','#partner-search','home_q','Canada','China'],['hub?year=all&hub_q=Canada&hub_sections_q=84','#hub-partner-search','hub_q','Canada','China'],['hub?year=all&hub_q=Canada&hub_sections_q=84','#hub-section-search','hub_sections_q','84','85']]){await visit(page,route);const input=page.locator(id);assert.equal(await input.inputValue(),initial);await page.reload({waitUntil:'networkidle'});assert.equal(await input.inputValue(),initial);await input.fill(next);assert.equal(new URL(page.url()).searchParams.get(key),next);await page.goBack({waitUntil:'networkidle'});assert.equal(await input.inputValue(),initial);assert.equal(new URL(page.url()).searchParams.get('year'),'all');}
 await visit(page,'?year=all&home_q=Canada&hub_q=China&hub_sections_q=84');const nav=page.getByRole('navigation',{name:'Main navigation'});await nav.getByRole('link',{name:'Hub',exact:true}).click();assert.equal(await page.locator('#hub-partner-search').inputValue(),'China');assert.equal(await page.locator('#hub-section-search').inputValue(),'84');await nav.getByRole('link',{name:'Explore',exact:true}).click();assert.equal(await page.locator('#partner-search').inputValue(),'Canada');
}));

// --- Search-driven CSV scopes, displayed counts and mobile scroll (P1 contract section "Required behavior") ---
// Independent expected values come only from raw snapshot data (data/<snapshot_id>/...) read through
// tests/e2e/lib/sorting-expected.mjs and lib/all-years-expected.mjs, never from src/.
const FILTERED_CSV_HEADER='period,start_year,end_year,query,sort_key,sort_direction,rank_metric,rank,code,name,kind,imports_status,imports_usd,exports_status,exports_usd,balance_status,balance_usd,total_trade_value_status,total_trade_value_usd';
function parseCsv(text){const rows=[];let row=[],v='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(q&&text[i+1]==='"'){v+='"';i++;}else q=!q;}else if(c===','&&!q){row.push(v);v='';}else if(c==='\n'&&!q){row.push(v.replace(/\r$/,''));rows.push(row);row=[];v='';}else v+=c;}const h=rows.shift();return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));}
async function pageTestOptions(options,fn){const page=await browser.newPage(options),errors=[];page.on('pageerror',e=>errors.push(e.message));try{await fn(page);assert.deepEqual(errors,[]);}finally{await page.close();}}
function matchesSearch(record,query){const q=query.toLowerCase();return record.name.toLowerCase().includes(q)||record.code.toLowerCase().includes(q);}
function financialRankMap(rows,metric){const sorted=expectedOrder(rows,r=>flowValue(r,metric),r=>r.code,'desc');return new Map(sorted.map((r,i)=>[r.code,flowValue(r,metric)===null?null:i+1]));}
function rankCell(map,code){const rank=map.get(code);return rank===null||rank===undefined?'':String(rank);}
function usdCell(flow){return flow.value===null?'':String(flow.value);}
async function downloadCsv(page,button){const pending=page.waitForEvent('download');await button.click();const download=await pending;const raw=fs.readFileSync(await download.path(),'utf8');return {filename:download.suggestedFilename(),raw,rows:parseCsv(raw)};}

test('both CSV scopes stay correct with an active home search and sort on 2013',()=>pageTestOptions({viewport:{width:1280,height:900},acceptDownloads:true},async page=>{
 const route='?year=2013&home_q=an&home_sort=imports&home_dir=asc';
 await visit(page,route);
 const rows=read('summary/2013.json').partners;
 const matched=rows.filter(r=>matchesSearch(r,'an'));
 assert.equal(matched.length,77,'independent match count for "an" in 2013 partner names/codes');
 const fullOrder=expectedOrder(rows,r=>flowValue(r,'imports'),r=>r.code,'asc');
 const filteredOrder=expectedOrder(matched,r=>flowValue(r,'imports'),r=>r.code,'asc');
 // Hard-coded independent expectations for this route's sort/rank state (not read from
 // the live app URL): home_sort=imports/home_dir=asc is the route under test, and the
 // rank metric this route is expected to carry is imports, computed from the
 // independent imports ordering below. A URL-normalization regression in the app must
 // surface as a failure here, not be silently absorbed by re-deriving from page.url().
 const rankMetric='imports';
 const sortKey='imports',sortDirection='asc';
 const rankMap=financialRankMap(rows,rankMetric);
 const fullBtn=page.getByRole('button',{name:'Download all partners CSV',exact:true});
 const filteredBtn=page.getByRole('button',{name:'Download filtered results CSV',exact:true});
 assert.equal(await filteredBtn.count(),1,'filtered CSV button must appear once a search is active');
 const full=await downloadCsv(page,fullBtn);
 assert.equal(full.rows.length,236,'full export keeps every partner regardless of the active search');
 assert.deepEqual(full.rows.map(r=>r.code),fullOrder.map(r=>r.code),'full export keeps the full sorted order');
 const filtered=await downloadCsv(page,filteredBtn);
 assert.equal(filtered.filename,'partners_2013_filtered.csv');
 const headerLine=filtered.raw.split(/\r?\n/)[0];
 assert.equal(headerLine,FILTERED_CSV_HEADER);
 assert.equal(filtered.rows.length,77);
 assert.deepEqual(filtered.rows.map(r=>r.code),filteredOrder.map(r=>r.code),'filtered export matches the sorted table order for matching partners only');
 for(const r of filtered.rows){
  const original=matched.find(x=>x.code===r.code);
  assert.ok(original,`filtered row ${r.code} must be an "an" match`);
  assert.equal(r.period,'2013');assert.equal(r.start_year,'2013');assert.equal(r.end_year,'2013');
  assert.equal(r.query,'an');assert.equal(r.sort_key,sortKey);assert.equal(r.sort_direction,sortDirection);assert.equal(r.rank_metric,rankMetric);
  assert.equal(r.rank,rankCell(rankMap,r.code));
  assert.equal(r.name,original.name);assert.equal(r.kind,original.kind);
  for(const field of ['imports','exports','balance','total_trade_value']){
   assert.equal(r[`${field}_status`],original[field].status,`${r.code} ${field}_status`);
   assert.equal(r[`${field}_usd`],usdCell(original[field]),`${r.code} ${field}_usd`);
  }
 }
 await page.locator('#partner-search').fill('');
 assert.equal(new URL(page.url()).searchParams.has('home_q'),false);
 assert.equal(await filteredBtn.count(),0,'filtered CSV button must disappear once search is cleared');
 assert.equal(await fullBtn.count(),1,'full CSV button remains after clearing search');
}));

test('filtered CSV for year=all uses independent all-years per-partner sums and the full coverage span',()=>pageTestOptions({viewport:{width:1280,height:900},acceptDownloads:true},async page=>{
 const route='?year=all&home_q=Canada';
 await visit(page,route);
 const filteredBtn=page.getByRole('button',{name:'Download filtered results CSV',exact:true});
 assert.equal(await filteredBtn.count(),1);
 const {filename,raw,rows:csv}=await downloadCsv(page,filteredBtn);
 assert.equal(filename,'partners_all_filtered.csv');
 assert.equal(raw.split(/\r?\n/)[0],FILTERED_CSV_HEADER);
 assert.equal(csv.length,1,'only CANADA (1220) is expected to match the query "Canada"');
 const row=csv[0];
 const canada=expectedPartners['1220'];
 assert.ok(canada,'independent all-years sums for partner 1220 must exist');
 const partnerMeta=read('partners.json').partners.find(p=>p.code==='1220');
 assert.equal(partnerMeta.name,'CANADA');assert.equal(partnerMeta.kind,'country');
 assert.equal(row.period,'all');
 assert.equal(row.start_year,String(coverageYears[0]));
 assert.equal(row.end_year,String(coverageYears[coverageYears.length-1]));
 assert.equal(row.code,'1220');assert.equal(row.name,'CANADA');assert.equal(row.kind,'country');
 assert.equal(row.query,'Canada');
 // Hard-coded independent expectations for this route (no explicit home_sort/home_dir/rank
 // in the URL): the default home sort is total_trade_value descending per docs/SPEC.md UI
 // RULES ("other tables by descending total trade"), so the default rank metric is also
 // total_trade_value. Not read from the live app URL, so an app normalization regression
 // cannot pass unnoticed.
 const sortKey='total_trade_value',sortDirection='desc',rankMetric='total_trade_value';
 assert.equal(row.sort_key,sortKey);assert.equal(row.sort_direction,sortDirection);assert.equal(row.rank_metric,rankMetric);
 const rankRows=Object.entries(expectedPartners).map(([code,v])=>({code,...v}));
 const rankMap=financialRankMap(rankRows,rankMetric);
 assert.equal(row.rank,rankCell(rankMap,'1220'));
 for(const field of ['imports','exports','balance','total_trade_value']){
  assert.equal(row[`${field}_status`],canada[field].status,`1220 ${field}_status`);
  assert.equal(row[`${field}_usd`],usdCell(canada[field]),`1220 ${field}_usd`);
 }
}));

test('home displayed counts match independent match counts with and without a search',()=>pageTest(async page=>{
 await visit(page,'?year=2013&home_q=an');
 const rows=read('summary/2013.json').partners;
 const matched=rows.filter(r=>matchesSearch(r,'an'));
 assert.equal(await page.locator('.home-ranking-table tbody tr').count(),matched.length,'row count must equal the match count when a search is active');
 const statusWithSearch=await page.locator('main').innerText();
 const withSearchPattern=new RegExp(`Showing ${matched.length} of ${rows.length} partners for[\\s\\S]*?\\(${matched.length} match your search\\)\\.`);
 assert.match(statusWithSearch,withSearchPattern,statusWithSearch);
 await visit(page,'?year=2013');
 assert.equal(await page.locator('.home-ranking-table tbody tr').count(),25,'default home table shows the top 25');
 const statusNoSearch=await page.locator('main').innerText();
 assert.match(statusNoSearch,new RegExp(`Showing 25 of ${rows.length} partners for`),statusNoSearch);
}));

test('mobile viewport keeps the document contained while the home table region scrolls horizontally under year=all with a search active',()=>pageTestOptions({viewport:{width:390,height:844}},async page=>{
 await visit(page,'?year=all&home_q=an');
 const dims=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,viewport:innerWidth}));
 assert.equal(dims.doc,dims.viewport,JSON.stringify(dims));
 const region=page.locator('.table-scroll').first();
 await region.waitFor();
 const overflow=await region.evaluate(e=>({scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
 assert.ok(overflow.scrollWidth>overflow.clientWidth,JSON.stringify(overflow));
}));

try{const results=await runAll();console.log(formatResults(results));fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({results},null,2)+'\n');if(results.some(r=>r.status!=='PASS'))process.exitCode=1;}finally{await browser.close();await server.stop();}
