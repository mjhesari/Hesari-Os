import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, Response as MockResponse, Log, LogLevel } from 'miniflare';
import { build } from 'esbuild';
import JSZip from 'jszip';
import brand from '../src/branding.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import { compatibilityDate, compatibilityFlags } from '../scripts/worker-config.js';
import { createRuntimeProfile, personalizeWorkerBundle, parseWorkerBundle } from '../src/common/worker-bundle.js';

// Only external providers are mocked. Every request executes the release Worker,
// its real handlers, configuration builders, authentication and KV storage.
const embedded = {
    accID: '00000000000000000000000000000001', accEmail: 'owner@example.com', apiToken: 'integration-test-only',
    vlUUID: '00000000-0000-4000-8000-000000000001', trPass: 'integration-test-password', securePath: 'integration-test-path',
    mainDomain: 'hesari-test.example.workers.dev', proxyIpMode: 'proxyip', proxyIPs: ['192.0.2.1'], prefixes: [], fallback: '', dohUrl: ''
};
const base = `https://${embedded.mainDomain}/${embedded.securePath}`;

async function getDefaults() {
    const result = await build({
        stdin: { contents: 'export { getKvSettings } from "./src/settings/settings.ts";', resolveDir: process.cwd() },
        bundle: true, write: false, format: 'esm', platform: 'node', define: { VERSION: JSON.stringify(pkg.version) },
        plugins: [{ name: 'defaults-only', setup(builder) {
            builder.onResolve({ filter: /^@kv$/ }, () => ({ path: 'unused-kv', namespace: 'fixture' }));
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function getDataset(){throw new Error("Not called by fixture");}' }));
        } }]
    });
    const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    return module.getKvSettings();
}

test('release Worker operates as a complete configuration panel', { timeout: 120_000 }, async t => {
    const source = readFileSync(new URL('../dist/worker.js', import.meta.url), 'utf8');
    const profile = createRuntimeProfile();
    const configuredSource = await personalizeWorkerBundle(source, profile, embedded);
    const uploads = [];
    const uploadedModules = [];
    const dnsRequests = [];
    const telegramRequests = [];
    const outboundService = async request => {
        const url = new URL(request.url);
        // Consume request bodies as a real provider does, including Worker uploads.
        const workerUpload = url.hostname === 'api.cloudflare.com' && request.method === 'PUT' && url.pathname.endsWith('/workers/scripts/hesari-test')
            ? await request.clone().formData() : null;
        const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
        if (url.hostname === 'cloudflare-dns.com') {
            dnsRequests.push({ method: request.method, search: url.search, body });
            if (request.method === 'POST') return new MockResponse(new TextEncoder().encode(body), { headers: { 'Content-Type': 'application/dns-message' } });
            return MockResponse.json({ Status: 0, Answer: [{ type: 1, data: '104.16.1.1' }, { type: 28, data: '2606:4700::1111' }] });
        }
        if (url.hostname === 'api.telegram.org') {
            telegramRequests.push(url.pathname);
            return MockResponse.json({ ok: true, result: true });
        }
        if (url.hostname === 'api.cloudflare.com' && url.pathname === `/client/v4/accounts/${embedded.accID}/workers/scripts/hesari-test` && request.method === 'PUT') {
            uploads.push(body);
            uploadedModules.push(await workerUpload.get('worker.js').text());
            return MockResponse.json({ success: true });
        }
        if (url.hostname === 'api.cloudflare.com' && url.pathname === '/client/v4/graphql') return MockResponse.json({
            data: { viewer: { accounts: [{ total: [{ sum: { requests: 120 } }], worker: [{ sum: { requests: 30 } }] }] } }
        });
        if (request.url === brand.updates.workerUrl) return new MockResponse(source);
        if (request.url === brand.updates.manifestUrl) return MockResponse.json({ version: pkg.version });
        if (url.hostname === 'api.cloudflareclient.com' && url.pathname === '/v0a4005/reg') return MockResponse.json({
            config: { interface: { addresses: { v6: '2606:4700:110::1234' } }, client_id: 'N16D', peers: [{ public_key: Buffer.alloc(32, 5).toString('base64') }] }
        });
        throw new Error(`Unexpected provider request in isolated test: ${url.origin}${url.pathname}`);
    };
    const mf = new Miniflare({
        modules: true, compatibilityDate, compatibilityFlags, kvNamespaces: [profile.kvBinding], outboundService,
        script: configuredSource,
        log: new Log(LogLevel.NONE)
    });
    t.after(() => mf.dispose());
    const kv = await mf.getKVNamespace(profile.kvBinding);
    await kv.put('proxySettings', JSON.stringify({ ...await getDefaults(), panelVersion: '5.1.1', bestPingInterval: 55 }));
    await kv.put('warpAccounts', JSON.stringify([1, 2].map(value => ({
        privateKey: Buffer.alloc(32, value).toString('base64'), publicKey: Buffer.alloc(32, 5).toString('base64'),
        warpIPv6: `2606:4700:110::${value}/128`, reserved: 'N16D'
    }))));
    let cookie;
    const request = (path, { body, method = 'GET', authenticated = true, ...options } = {}) => mf.dispatchFetch(`${base}/${path}`, {
        redirect: 'manual', method, ...options,
        headers: { ...(cookie && authenticated ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
        ...(body ? { body: JSON.stringify(body) } : {})
    });

    async function assertUploadedWorkerRuns(worker, password) {
        assert.deepEqual(parseWorkerBundle(worker).profile, profile);
        const restored = new Miniflare({
            modules: true, compatibilityDate, compatibilityFlags, kvNamespaces: [profile.kvBinding], outboundService,
            script: worker, log: new Log(LogLevel.NONE)
        });
        try {
            const restoredKV = await restored.getKVNamespace(profile.kvBinding);
            for (const { name } of (await kv.list()).keys) await restoredKV.put(name, await kv.get(name));
            const response = await restored.dispatchFetch(`${base}/panel/settings`, { headers: { Cookie: cookie } });
            assert.equal(response.status, 200, 'uploaded Worker must still authenticate with existing KV');
            const { body } = await response.json();
            assert.equal(body.proxySettings.trPass, password);
            assert.equal(body.proxySettings.bypassIran, true);
            const subscription = await restored.dispatchFetch(`${base}/sub/raw?app=xray`);
            assert.equal(subscription.status, 200);
            assert.ok(Buffer.from(await subscription.text(), 'base64').toString().includes(`trojan://${password}`));
        } finally {
            await restored.dispose();
        }
    }

    await t.test('initial setup renders production HTML and requires account email', async () => {
        const panel = await request('panel');
        assert.equal(panel.status, 200);
        const html = await panel.text();
        assert.ok(html.includes(brand.name));
        assert.doesNotMatch(html, /data-preview|Design preview|Sample settings|preview-only/);
        const settings = await request('panel/settings');
        assert.equal(settings.status, 401);
        assert.equal((await settings.json()).body.isPassSet, false);
        const invalid = await request('panel/reset-password', { method: 'POST', body: { username: 'wrong@example.com', password: 'LocalPassword!123' } });
        assert.equal(invalid.status, 400);
        const setup = await request('panel/reset-password', { method: 'POST', body: { username: embedded.accEmail, password: 'LocalPassword!123' } });
        assert.equal(setup.status, 200);
        assert.equal(await kv.get('pwd'), 'LocalPassword!123');
    });

    await t.test('authentication protects the panel and issues a secure session cookie', async () => {
        const panel = await request('panel', { authenticated: false });
        assert.equal(panel.status, 302);
        assert.ok(panel.headers.get('location').endsWith('/login'));
        const wrong = await request('login/authenticate', { method: 'POST', body: { username: embedded.accEmail, password: 'wrong' } });
        assert.equal(wrong.status, 401);
        const login = await request('login/authenticate', { method: 'POST', body: { username: embedded.accEmail, password: 'LocalPassword!123' } });
        assert.equal(login.status, 200);
        const setCookie = login.headers.get('set-cookie');
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /Secure/i);
        cookie = setCookie.split(';')[0];
        const settings = await request('panel/settings');
        assert.equal(settings.status, 200);
        const data = await settings.json();
        assert.equal(data.body.proxySettings.vlUUID, embedded.vlUUID);
        assert.equal(data.body.proxySettings.apiToken, undefined);
        assert.equal(data.body.proxySettings.panelVersion, pkg.version);
        assert.equal(data.body.proxySettings.bestPingInterval, 55, 'upgrading the upstream dataset must preserve user settings');
    });

    await t.test('all supported subscription formats are generated by the production handlers', async t => {
        const matrix = {
            normal: ['xray', 'sing-box', 'clash'], fragment: ['xray', 'sing-box'], raw: ['xray', 'sing-box'],
            warp: ['xray', 'sing-box', 'clash', 'wireguard'], 'warp-pro': ['xray', 'xray-knocker', 'clash', 'amnezia']
        };
        for (const [type, cores] of Object.entries(matrix)) for (const core of cores) {
            await t.test(`${type} / ${core}`, async () => {
                const response = await request(`sub/${type}?app=${core}`, { authenticated: false });
                assert.equal(response.status, 200);
                if (['wireguard', 'amnezia'].includes(core)) {
                    assert.match(response.headers.get('content-type'), /application\/zip/);
                    const zip = await JSZip.loadAsync(await response.arrayBuffer());
                    const file = Object.keys(zip.files)[0];
                    assert.ok(file.startsWith(brand.shortName));
                    assert.match(await zip.file(file).async('string'), /\[Interface\]/);
                } else if (type === 'raw') {
                    const text = Buffer.from(await response.text(), 'base64').toString('utf8');
                    assert.ok(text.includes(`vless://${embedded.vlUUID}`));
                    assert.ok(text.includes(`trojan://${embedded.trPass}`));
                } else {
                    const config = await response.json();
                    assert.equal(config.success, undefined, JSON.stringify(config));
                    assert.ok(Array.isArray(config) ? config.length > 0 : Object.keys(config).length > 0);
                    const serialized = JSON.stringify(config);
                    if (['normal', 'fragment'].includes(type)) assert.ok(serialized.includes(embedded.vlUUID));
                }
            });
        }
    });

    await t.test('settings save to KV and invalid settings are rejected', async () => {
        const { body } = await (await request('panel/settings')).json();
        const settings = { ...body.proxySettings, bypassIran: true };
        const invalid = await request('panel/update-settings', { method: 'PUT', body: { ...settings, vlUUID: 'invalid' } });
        assert.equal(invalid.status, 400);
        const saved = await request('panel/update-settings', { method: 'PUT', body: settings });
        assert.equal(saved.status, 200, await saved.text());
        assert.equal(JSON.parse(await kv.get('proxySettings')).bypassIran, true);
    });

    await t.test('changing main settings submits the complete personalized Worker to Cloudflare', async () => {
        const { body } = await (await request('panel/settings')).json();
        const response = await request('panel/update-settings', { method: 'PUT', body: { ...body.proxySettings, trPass: 'changed-test-password' } });
        assert.equal(response.status, 200, await response.text());
        assert.equal(uploads.length, 1);
        const upload = uploads[0];
        assert.ok(upload.includes(profile.names.panel));
        assert.ok(upload.includes(profile.names.config));
        assert.deepEqual(parseWorkerBundle(uploadedModules.at(-1)).profile, profile);
        await assertUploadedWorkerRuns(uploadedModules.at(-1), 'changed-test-password');
    });

    await t.test('share settings, QR code, usage and WARP renewal execute real routes', async () => {
        const shared = await request('sub/share-settings');
        assert.match(shared.headers.get('content-disposition'), /hesari-os-settings\.dat/);
        assert.equal(JSON.parse(Buffer.from(await shared.text(), 'base64').toString()).bypassIran, true);
        const qr = await request(`qrcode?data=${encodeURIComponent(`${base}/sub/normal?app=xray`)}`);
        assert.match(qr.headers.get('content-type'), /image\/png/);
        assert.deepEqual([...new Uint8Array(await qr.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        const usage = await (await request('panel/usage')).json();
        assert.deepEqual(usage.body, { total: 120, worker: 30 });
        const renewed = await request('panel/update-warp', { method: 'POST' });
        assert.equal(renewed.status, 200, await renewed.text());
        assert.equal(JSON.parse(await kv.get('warpAccounts')).length, 2);
    });

    await t.test('update panel downloads this repository release and submits a deployment', async () => {
        const unauthorized = await request('panel/version', { authenticated: false });
        assert.equal(unauthorized.status, 401);
        const version = await (await request('panel/version')).json();
        assert.equal(version.body.version, pkg.version);
        const before = uploads.length;
        const response = await request('panel/update-panel', { method: 'POST' });
        assert.equal(response.status, 200, await response.text());
        assert.equal(uploads.length, before + 1);
        await assertUploadedWorkerRuns(uploadedModules.at(-1), embedded.trPass);
    });

    await t.test('private DoH forwards GET queries and POST wire messages', async () => {
        const get = await request('dns-query?name=example.com&type=A', { authenticated: false });
        assert.equal(get.status, 200);
        assert.equal((await get.json()).Status, 0);
        assert.ok(dnsRequests.at(-1).search.includes('name=example.com'));
        const post = await mf.dispatchFetch(`${base}/dns-query`, {
            method: 'POST', headers: { 'Content-Type': 'application/dns-message' }, body: new Uint8Array([0x12, 0x34])
        });
        assert.match(post.headers.get('content-type'), /application\/dns-message/);
        assert.deepEqual([...new Uint8Array(await post.arrayBuffer())], [0x12, 0x34]);
        assert.equal(dnsRequests.at(-1).method, 'POST');
    });

    await t.test('VLESS and Trojan transport routes accept WebSocket upgrades', async () => {
        for (const protocol of ['vl', 'tr']) {
            const response = await mf.dispatchFetch(`https://${embedded.mainDomain}/${protocol}/test`, { headers: { Upgrade: 'websocket' } });
            assert.equal(response.status, 101);
            assert.ok(response.webSocket);
            response.webSocket.accept();
            response.webSocket.close(1000, 'Integration test complete');
        }
    });

    await t.test('Telegram setup and removal persist bot configuration and call provider APIs', async () => {
        const setup = await request('telegram/setup', { method: 'PUT', body: { telegramBotToken: '123456:test-only', telegramUserId: '123456' } });
        assert.equal(setup.status, 200, await setup.text());
        assert.equal(JSON.parse(await kv.get('telegramBot')).telegramUserId, '123456');
        assert.ok(telegramRequests.some(path => path.endsWith('/setWebhook')));
        assert.ok(telegramRequests.some(path => path.endsWith('/setMyCommands')));
        const removed = await request('telegram/remove', { method: 'POST' });
        assert.equal(removed.status, 200, await removed.text());
        assert.equal(JSON.parse(await kv.get('telegramBot')).telegramBotToken, '');
        assert.ok(telegramRequests.some(path => path.endsWith('/deleteWebhook')));
    });

    await t.test('logout clears the session and unknown private paths return 404', async () => {
        const response = await request('panel/logout');
        assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
        const denied = await request('panel/settings', { authenticated: false });
        assert.equal(denied.status, 401);
        assert.equal((await mf.dispatchFetch(`https://${embedded.mainDomain}/wrong-path/panel`)).status, 404);
    });
});
