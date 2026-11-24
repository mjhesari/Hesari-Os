import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { compatibilityDate, compatibilityFlags } from '../scripts/worker-config.js';
import { parseWorkerBundle } from '../src/common/worker-bundle.js';

const source = readFileSync(new URL('../dist/worker.js', import.meta.url), 'utf8');
const profile = parseWorkerBundle(source).profile;
const embedded = {
    accID: 'test-account', accEmail: 'owner@example.com', apiToken: 'test-only',
    vlUUID: '00000000-0000-4000-8000-000000000001', trPass: 'test-only', securePath: 'private',
    mainDomain: 'hesari.example.workers.dev', proxyIpMode: 'proxyip', proxyIPs: [], prefixes: [], fallback: '', dohUrl: ''
};
const panelUrl = `https://${embedded.mainDomain}/${embedded.securePath}/panel`;

function runtime(t, { settings = embedded, assets = {}, namespaces = [profile.kvBinding], bindings = {} } = {}) {
    const mf = new Miniflare({
        modules: true, compatibilityDate, compatibilityFlags, kvNamespaces: namespaces, bindings,
        script: `${settings ? `Object.assign(globalThis,${JSON.stringify({ [profile.names.config]: settings })});` : ''}\n${source}\nObject.assign(globalThis,${JSON.stringify(Object.fromEntries(Object.entries(assets).map(([role, value]) => [profile.names[role], value])))});`,
        log: new Log(LogLevel.NONE)
    });
    t.after(() => mf.dispose());
    return mf;
}

test('release Worker catches asynchronous page failures and sends HTTP 500', async t => {
    const mf = runtime(t, { namespaces: ['kv'], assets: { panel: 'invalid gzip payload' } });
    const response = await mf.dispatchFetch(panelUrl);
    assert.equal(response.status, 500);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /HESARI OS/);
});

test('release Worker still responds when the error page cannot be decompressed', async t => {
    const mf = runtime(t, { namespaces: ['kv'], assets: { panel: 'broken', error: 'broken' } });
    const response = await mf.dispatchFetch(panelUrl);
    assert.equal(response.status, 500);
    assert.match(response.headers.get('content-type'), /text\/plain/);
    assert.match(await response.text(), /HESARI OS/);
});

test('missing embedded settings produce installation guidance with HTTP 500', async t => {
    const mf = runtime(t, { settings: null });
    const response = await mf.dispatchFetch(panelUrl);
    assert.equal(response.status, 500);
    assert.match(await response.text(), /embedded account settings/);
});

test('missing KV produces actionable configuration guidance with HTTP 500', async t => {
    const mf = runtime(t, { namespaces: [] });
    const response = await mf.dispatchFetch(panelUrl);
    assert.equal(response.status, 500);
    assert.ok((await response.text()).includes(profile.kvBinding));
});

test('personal and legacy KV bindings preserve existing panel credentials', async t => {
    for (const name of [profile.kvBinding, 'kv', 'bpb', 'en']) {
        await t.test(name, async t => {
            const mf = runtime(t, { namespaces: [name] });
            const kv = await mf.getKVNamespace(name);
            await kv.put('pwd', 'existing-panel-password');
            const response = await mf.dispatchFetch(panelUrl, { redirect: 'manual' });
            assert.equal(response.status, 302);
            assert.match(response.headers.get('location'), /\/private\/login$/);
        });
    }
});

test('personal KV takes precedence when multiple bindings exist', async t => {
    const mf = runtime(t, { namespaces: [profile.kvBinding, 'kv'] });
    await (await mf.getKVNamespace(profile.kvBinding)).put('pwd', 'existing-panel-password');
    const response = await mf.dispatchFetch(panelUrl, { redirect: 'manual' });
    assert.equal(response.status, 302);
});

test('embedded settings remain authoritative when legacy environment variables exist', async t => {
    const mf = runtime(t, { bindings: { UUID: 'legacy', TR_PASS: 'legacy', TROJAN_PASS: 'legacy', PASS: 'legacy' } });
    const response = await mf.dispatchFetch(panelUrl);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /HESARI OS/);
});
