// Measures CDP encodedDataLength from an empty browser context.
// This is measured network traffic, separate from the local gzip budget.
export async function measureColdLoadBytes(browser, url) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    const entries = new Map();
    const failures = [];
    client.on('Network.requestWillBeSent', e => {
      if (e.redirectResponse) {
        const previous = entries.get(e.requestId);
        if (previous) entries.set(`${e.requestId}:${entries.size}`, { ...previous, status: e.redirectResponse.status, bytes: e.redirectResponse.encodedDataLength, finished: true });
      }
      entries.set(e.requestId, { url: e.request.url, bytes: 0, finished: false });
    });
    client.on('Network.responseReceived', e => {
      const headers = Object.fromEntries(Object.entries(e.response.headers).map(([k,v]) => [k.toLowerCase(),v]));
      Object.assign(entries.get(e.requestId), { status: e.response.status, encoding: headers['content-encoding'] || 'identity', mimeType: e.response.mimeType, fromDiskCache: e.response.fromDiskCache || false, fromServiceWorker: e.response.fromServiceWorker || false });
    });
    client.on('Network.loadingFinished', e => Object.assign(entries.get(e.requestId), { bytes: e.encodedDataLength, finished: true }));
    client.on('Network.loadingFailed', e => failures.push({ requestId: e.requestId, error: e.errorText }));
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (response.status() !== 200) throw new Error(`HTTP ${response.status()}: ${url}`);
    if (failures.length) throw new Error(JSON.stringify(failures));
    const assets = [...entries.values()].sort((a,b) => a.url.localeCompare(b.url));
    if (assets.some(a => !a.finished || a.status >= 400)) throw new Error('Incomplete or failed network requests');
    return { url, totalBytes: assets.reduce((s,a) => s+a.bytes,0), metric: 'CDP Network.loadingFinished encodedDataLength, including response headers', assets };
  } finally { await context.close(); }
}
