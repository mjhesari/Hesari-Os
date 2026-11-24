import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import { build } from 'esbuild';
import { renderAsset, validateBranding, escapeHtml, brandIcon } from './assets.js';
import brand from '../src/branding.json' with { type: 'json' };
import { compilerNames, createRuntimeProfile, encodeWorkerBundle, parseWorkerBundle } from '../src/common/worker-bundle.js';

globalThis[compilerNames.profile] = createRuntimeProfile();

test('all embedded pages bundle with the same identity and valid JavaScript', async () => {
    for (const page of ['panel', 'login', 'proxy-ip', 'error']) {
        const html = await renderAsset(page);
        assert.ok(html.includes(brand.name), page);
        assert.ok(html.includes(brand.colors.accent), page);
        assert.ok(html.includes('GPL-3.0'), page);
        assert.doesNotMatch(html, /__(?:BRAND_\w+|VERSION)__/, page);
        assert.match(html, /image\/svg\+xml/);
        if (page === 'panel' && brand.documentationFormat === 'markdown') {
            assert.ok(html.includes('docs/en/docs/configuration/common.md'));
            assert.ok(!html.includes('Hesari-Os/blob/main/docs/en/docs/configuration/common/'));
        }
        for (const [, attributes, code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
            if (!attributes.includes('module')) new Script(code, { filename: `${page}.js` });
        }
    }
});

test('branding validation rejects unsafe colors, links and incomplete update sources', () => {
    validateBranding();
    assert.throws(() => validateBranding({ ...brand, colors: { ...brand.colors, accent: '</style>' } }));
    assert.throws(() => validateBranding({ ...brand, websiteUrl: 'javascript:alert(1)' }));
    assert.throws(() => validateBranding({ ...brand, slug: '../secret' }));
    assert.throws(() => validateBranding({ ...brand, updates: { ...brand.updates, manifestUrl: '', workerUrl: 'https://example.com/worker.js' } }));
    assert.equal(escapeHtml('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
    assert.match(brandIcon(), /^<svg/);
});

async function loadBuildScript(updates = { manifestUrl: '', workerUrl: '', releaseNotesUrl: '' }) {
    const result = await build({
        stdin: { contents: 'export { buildScript } from "./src/settings/main.ts";', resolveDir: process.cwd() },
        write: false, bundle: true, format: 'esm', platform: 'node',
        plugins: [{ name: 'isolate-cloudflare', setup(builder) {
            builder.onResolve({ filter: /^@/ }, args => ({ path: args.path, namespace: 'test' }));
            builder.onLoad({ filter: /branding\.json$/ }, () => ({ contents: JSON.stringify({ ...brand, updates }), loader: 'json' }));
            builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === '@settings'
                ? 'export const getGlobals = () => ({ accID: "example", accEmail: "test@example.com", apiToken: "test-only", mainDomain: "" }); export const getSettings = () => ({}); export const getMainSettings = () => ({});'
                : path === '@common'
                    ? 'export const decompressGzipBase64 = async () => "/* retained local source */"; export const safeError = String;'
                    : 'export const deployPages = () => {}; export const getPagesDomains = () => []; export const setPagesDomain = () => {}; export const deployWorkers = () => {}; export const getWorkerDomains = () => []; export const setWorkerDomain = () => {}; export const createCNAME = () => {}; export const listZones = () => [];' }));
        } }]
    });
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

test('updates cannot fall back to upstream when the personal update channel is empty', async () => {
    const { buildScript } = await loadBuildScript();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => assert.fail('Disabled updates must not make network requests');
    try { await assert.rejects(buildScript(true), /Updates are disabled/); }
    finally { globalThis.fetch = originalFetch; }
});

test('configured updates reject failed downloads and non-worker content', async () => {
    const { buildScript } = await loadBuildScript({ workerUrl: 'https://example.com/worker.js', manifestUrl: 'https://example.com/package.json', releaseNotesUrl: '' });
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response('Not Found', { status: 404 });
        await assert.rejects(buildScript(true), /HTTP 404/);
        globalThis.fetch = async () => new Response('<html>Wrong download</html>');
        await assert.rejects(buildScript(true), /did not return a bundled panel worker/);
    } finally { globalThis.fetch = originalFetch; }
});

test('saving settings preserves the personalized embedded assets', async () => {
    const { buildScript } = await loadBuildScript();
    const keys = ['source', 'panel', 'login', 'error', 'proxy', 'icon'].map(role => compilerNames[role]);
    const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
    keys.forEach(key => { globalThis[key] = `personalized-${key}`; });
    try {
        const output = await buildScript(false, { vlUUID: 'example', trPass: 'test-only', securePath: 'private', proxyIpMode: 'proxyip', proxyIPs: [], prefixes: [], fallback: '', dohUrl: '' });
        keys.slice(1).forEach(key => assert.ok(output.includes(`personalized-${key}`), key));
        assert.ok(output.includes('retained local source'));
        assert.deepEqual(parseWorkerBundle(output).profile, globalThis[compilerNames.profile]);
        new Script(output);
    } finally { keys.forEach(key => { if (previous[key] === undefined) delete globalThis[key]; else globalThis[key] = previous[key]; }); }
});

test('local worker configuration embeds settings privately and refuses incomplete input', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'hesari-configure-'));
    try {
        for (const folder of ['scripts', 'src', 'dist']) mkdirSync(join(fixture, folder));
        mkdirSync(join(fixture, 'src/common'));
        copyFileSync(new URL('../src/common/worker-bundle.js', import.meta.url), join(fixture, 'src/common/worker-bundle.js'));
        copyFileSync(new URL('./configure-worker.js', import.meta.url), join(fixture, 'scripts/configure-worker.mjs'));
        copyFileSync(new URL('./worker-config.js', import.meta.url), join(fixture, 'scripts/worker-config.js'));
        writeFileSync(join(fixture, 'package.json'), '{"type":"module"}');
        writeFileSync(join(fixture, 'src/branding.json'), JSON.stringify(brand));
        writeFileSync(join(fixture, 'dist/worker.js'), await encodeWorkerBundle('/* public worker */', { panel: '', login: '', error: '', proxy: '', icon: '' }, createRuntimeProfile()));
        const settings = { accID: 'example', accEmail: 'test@example.com', apiToken: 'private-test-token', vlUUID: '00000000-0000-4000-8000-000000000001', trPass: 'test-only', securePath: 'private', mainDomain: 'example.workers.dev', proxyIpMode: 'prefix', proxyIPs: [], prefixes: [] };
        const command = [join(fixture, 'scripts/configure-worker.mjs')];
        const incomplete = spawnSync(process.execPath, command, { input: JSON.stringify({ ...settings, mainDomain: '' }), encoding: 'utf8' });
        assert.equal(incomplete.status, 1);
        assert.match(incomplete.stderr, /mainDomain/);
        const configured = spawnSync(process.execPath, command, { input: JSON.stringify(settings), encoding: 'utf8' });
        assert.equal(configured.status, 0, configured.stderr);
        assert.ok(!configured.stdout.includes(settings.apiToken));
        const output = join(fixture, '.local/worker.js');
        const script = readFileSync(output, 'utf8');
        assert.ok(script.includes(settings.apiToken));
        assert.ok(script.includes('public worker'));
        assert.equal(statSync(output).mode & 0o777, 0o600);
        new Script(script);
    } finally { rmSync(fixture, { recursive: true, force: true }); }
});
