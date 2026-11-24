import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureWorker } from '../scripts/worker-config.js';
import { createRuntimeProfile, parseWorkerBundle, personalizeWorkerBundle, unpackSource } from '../src/common/worker-bundle.js';

const source = readFileSync(new URL('../dist/worker.js', import.meta.url), 'utf8');
const settings = {
    accID: 'test-account', accEmail: 'owner@example.com', apiToken: 'private-test-only',
    vlUUID: '00000000-0000-4000-8000-000000000001', trPass: 'test-only', securePath: 'private',
    mainDomain: 'unit.example.workers.dev'
};

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'worker-identifiers-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist/worker.js'), source);
    return root;
}

test('each installation gets distinct unbranded variable names and consistent compressed source', async t => {
    const root = fixture(t);
    const otherRoot = fixture(t);
    const output = await configureWorker(settings, { root });
    const otherOutput = await configureWorker(settings, { root: otherRoot });
    const worker = readFileSync(output, 'utf8');
    const configured = parseWorkerBundle(worker);
    const other = parseWorkerBundle(readFileSync(otherOutput, 'utf8'));
    const firstNames = [configured.profile.kvBinding, ...Object.values(configured.profile.names)];
    const secondNames = new Set([other.profile.kvBinding, ...Object.values(other.profile.names)]);
    assert.ok(firstNames.every(name => /^[a-z][a-f0-9]{24}$/.test(name) && !secondNames.has(name)));
    assert.deepEqual(configured.config, { ...settings, proxyIpMode: 'proxyip', proxyIPs: [], prefixes: [], fallback: '', dohUrl: '' });
    const script = await unpackSource(configured.source);
    assert.doesNotMatch(script, /HESARI_|\b_R_[A-Z]+_\b/);
    assert.equal(worker.slice(worker.indexOf('\n') + 1), script);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(statSync(join(root, '.local/identifiers.json')).mode & 0o777, 0o600);
    assert.ok(!readFileSync(join(root, '.local/identifiers.json'), 'utf8').includes(settings.apiToken));
});

test('reconfiguration and new release bundles preserve installation identifiers', async t => {
    const root = fixture(t);
    const output = await configureWorker(settings, { root });
    const original = parseWorkerBundle(readFileSync(output, 'utf8')).profile;
    writeFileSync(join(root, 'dist/worker.js'), await personalizeWorkerBundle(source, createRuntimeProfile()));
    await configureWorker({ ...settings, trPass: 'new-test-password' }, { root });
    const changed = parseWorkerBundle(readFileSync(output, 'utf8'));
    assert.deepEqual(changed.profile, original);
    assert.equal(changed.config.trPass, 'new-test-password');

    await configureWorker({ ...settings, mainDomain: 'another.example.workers.dev' }, { root });
    const other = parseWorkerBundle(readFileSync(output, 'utf8')).profile;
    assert.notEqual(other.kvBinding, original.kvBinding);
    await configureWorker(settings, { root });
    assert.deepEqual(parseWorkerBundle(readFileSync(output, 'utf8')).profile, original);
});

test('a corrupt identifier registry is preserved instead of silently changing the KV binding', async t => {
    const root = fixture(t);
    await configureWorker(settings, { root });
    const path = join(root, '.local/identifiers.json');
    for (const invalid of ['not-json', '{"version":1,"installations":{"invalid":{}}}']) {
        writeFileSync(path, invalid);
        await assert.rejects(configureWorker(settings, { root }), /identifiers were not regenerated/);
        assert.equal(readFileSync(path, 'utf8'), invalid);
    }
});
