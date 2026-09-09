import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './lib/static-server.mjs';
import { currentSnapshotId, REPO_ROOT } from './lib/server.mjs';
import { measureColdLoadBytes } from './lib/cdp.mjs';
import { test, runAll, formatResults } from './lib/harness.mjs';

const reportDir = path.join(REPO_ROOT, 'reports/tests', process.env.BASE_URL ? 'deployed' : 'local-audit');
fs.mkdirSync(reportDir, { recursive: true });
const server = process.env.BASE_URL ? null : await startStaticServer();
const base = (process.env.BASE_URL || server.baseUrl).replace(/\/?$/, '/');
const snapshot = currentSnapshotId();
const readData = file => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', snapshot, file)));
const meta = readData('meta.json');
const summary = readData('summary/2025.json');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
async function go(route) { const response = await page.goto(base + route, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200); }
async function download(button) {
  const pending = page.waitForEvent('download');
  await button.click();
  const item = await pending;
  return fs.readFileSync(await item.path(), 'utf8');
}

test('home: full width map, 25 default, all rows, search, fixed world totals, trillion exact access', async () => {
  await go('?year=2025');
  assert.equal(await page.locator('tbody tr').count(), 25);
  const world = page.getByRole('region', { name: 'World total', exact: true });
  const text = await world.innerText();
  assert.ok(text.includes('$3.41tn'));
  const amount = world.locator('[title="$3,414,510,592,814"]');
  assert.ok(await amount.count());
  await amount.click();
  assert.equal(await amount.innerText(), '$3,414,510,592,814');
  await amount.click();
  const map = await page.locator('.world-map svg[role="img"]').boundingBox();
  const main = await page.locator('main').boundingBox();
  assert.ok(map.width >= main.width * 0.85 && map.height >= 300, JSON.stringify({map,main}));
  await page.getByRole('button', { name: /Show all/ }).click();
  assert.equal(await page.locator('tbody tr').count(), summary.partners.length);
  await page.locator('input[type="search"]').fill('1610');
  assert.equal(await page.locator('tbody tr').count(), 1);
  assert.ok((await page.locator('tbody').innerText()).includes('1610'));
  assert.equal(await world.innerText(), text);
  const csv = await download(page.getByRole('button', {name:'Download all partners CSV',exact:true}));
  assert.equal(csv.trim().split('\n').length, summary.partners.length+1);
  assert.ok(csv.includes('5700') && csv.includes('1610'));
  assert.ok(csv.includes(String(summary.partners.find(p=>p.code==='5700').imports.value)));
  assert.ok((await page.locator('.home-table-pane').innerText()).includes(`Showing 1 of ${summary.partners.length}`));
  return { total: summary.partners.length, mapWidth: map.width, mapHeight: map.height };
});

test('home and section: year/rank survive refresh and one sorted section table', async () => {
  for (const [route, selector] of [['?year=2020&rank=exports','#rank-field'],['section/XVI?year=2020&rank=exports','#section-rank-field']]) {
    await go(route);
    assert.equal(await page.locator(selector).inputValue(), 'exports');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).searchParams.get('year'),'2020');
    assert.equal(await page.locator(selector).inputValue(),'exports');
    await page.locator(selector).selectOption('balance');
    assert.equal(new URL(page.url()).searchParams.get('rank'),'balance');
  }
  assert.equal(await page.locator('table').count(),1);
  const row = await page.locator('tbody tr').first().innerText();
  const values = readData('section/XVI.json').years.find(y=>y.year===2020).partners;
  const highest = [...values].sort((a,b)=>(b.balance.value ?? -Infinity)-(a.balance.value ?? -Infinity))[0];
  assert.ok(row.includes(highest.code), row);
  const csv = await download(page.getByRole('button',{name:'Download CSV',exact:true}));
  assert.ok(csv.includes(String(highest.balance.value)));
  assert.ok(csv.includes('imports_status'));
});

test('map: mouse and keyboard selection preserve year', async () => {
  for (const action of ['click','Enter','Space']) {
    await go('?year=2020');
    const country = page.locator('svg [role="button"][aria-label^="China" i]');
    if (action === 'click') await country.click(); else { await country.focus(); await country.press(action); }
    await page.waitForURL(/partner\//);
    assert.equal(new URL(page.url()).searchParams.get('year'),'2020');
  }
});

test('methodology: filled metadata, 8220, no template markers', async () => {
  await go('methodology');
  const body = await page.locator('main').innerText();
  assert.ok(body.includes(snapshot));
  assert.ok(body.includes(meta.code_commit));
  assert.ok(body.includes('Unidentified Countries (Census code 8220)'));
  assert.ok(!/\{\{|\}\}|\bTODO\b|\[SNAPSHOT|PLACEHOLDER/.test(body));
});

test('partner: exact integer CSV with statuses and missing-data labels', async () => {
  await go('partner/6022?year=2023');
  const csv = await download(page.getByRole('button',{name:'Download CSV',exact:true}).first());
  assert.ok(csv.includes('exports_status'));
  const record = readData('partner/6022.json').years.find(y=>y.year===2023);
  assert.ok(csv.includes(String(record.imports.value)));
  assert.ok(csv.includes('absent'));
  assert.ok(await page.locator('.money-cell-missing').count());
  await page.getByLabel('Show exact USD in tables').check();
  assert.ok(await page.getByText('$'+record.imports.value.toLocaleString('en-US'),{exact:true}).count());
});

test('all known routes: real HTTP 200 and query preservation', async () => {
  const partners = readData('partners.json').partners.filter(p=>p.resolution==='approved');
  const sections = readData('hs_sections.json').groups;
  const routes = ['', 'hub', 'methodology', ...partners.map(p=>`partner/${p.code}`), ...sections.map(s=>`section/${s.id}`)];
  for (const route of routes) {
    const response = await fetch(base+route+'?year=2020&rank=exports');
    assert.equal(response.status,200,route);
    assert.equal(new URL(response.url).searchParams.get('year'),'2020',route);
    assert.equal(new URL(response.url).searchParams.get('rank'),'exports',route);
  }
  return {routes:routes.length};
});

test('desktop/mobile: route refresh, no overflow, numeric nowrap, container scroll, screenshots', async () => {
  const routes = ['', 'partner/5700?year=2025', 'section/XVI?year=2025&rank=exports', 'hub', 'methodology'];
  for (const [device,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await go(route);
      const refreshed = await page.reload({waitUntil:'networkidle'});
      assert.equal(refreshed.status(),200);
      assert.ok((await page.locator('body').innerText()).includes('US goods trade, Census basis. Excludes services. Values are nominal USD.'));
      const layout = await page.evaluate(()=>({ width:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth, bad:[...document.querySelectorAll('.money-cell')].filter(e=>getComputedStyle(e).whiteSpace!=='nowrap').length, tables:[...document.querySelectorAll('table')].map(t=>({ wrapped:!!t.closest('.table-scroll'), overflow:t.closest('.table-scroll')&&getComputedStyle(t.closest('.table-scroll')).overflowX })) }));
      assert.ok(layout.scroll <= layout.width+1,JSON.stringify({route,layout}));
      assert.equal(layout.bad,0);
      assert.ok(layout.tables.every(t=>t.wrapped&&['auto','scroll'].includes(t.overflow)),JSON.stringify(layout));
      if(device==='mobile') await page.locator('.table-scroll').evaluateAll(es=>es.forEach(e=>{if(e.scrollWidth>e.clientWidth){e.scrollLeft=80;if(!e.scrollLeft)throw Error('cannot scroll');}}));
      const imageName = `${device}-${route.split('?')[0].replaceAll('/','-')||'home'}`;
      await page.screenshot({ path:path.join(reportDir,`${imageName}.png`), fullPage:true });
      await page.screenshot({ path:path.join(reportDir,`${imageName}-viewport.png`), fullPage:false });
    }
  }
  assert.deepEqual(errors,[]);
});

test('cold-load network transfer: measured bytes and all request encodings', async () => {
  const measurements = {};
  for (const [name, route] of [['home',''],['partner','partner/5700?year=2025']]) measurements[name]=await measureColdLoadBytes(browser,base+route);
  fs.writeFileSync(path.join(reportDir,'network.json'), JSON.stringify(measurements,null,2)+'\n');
  assert.ok(!measurements.partner.assets.some(a=>a.url.includes('/atlas/')));
  return Object.fromEntries(Object.entries(measurements).map(([k,v])=>[k,v.totalBytes]));
});
try {
  const results = await runAll();
  fs.writeFileSync(path.join(reportDir,'results.json'),JSON.stringify(results,null,2)+'\n');
  console.log(formatResults(results));
  process.exitCode=results.some(r=>r.status!=='PASS')?1:0;
} finally { await browser.close(); if(server) await server.stop(); }
