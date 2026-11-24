import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { parseWorkerBundle } from '../src/common/worker-bundle.js';

test('deployment CLI prepares a valid Worker and local development executes real routes', { timeout: 90_000 }, async t => {
    const fixture = mkdtempSync(join(tmpdir(), 'hesari-cli-'));
    const logDirectory = mkdtempSync(join(tmpdir(), 'hesari-cli-logs-'));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    t.after(() => rmSync(logDirectory, { recursive: true, force: true }));
    for (const folder of ['scripts', 'src', 'dist', '.local']) mkdirSync(join(fixture, folder));
    mkdirSync(join(fixture, 'src/common'));
    copyFileSync(new URL('../src/common/worker-bundle.js', import.meta.url), join(fixture, 'src/common/worker-bundle.js'));
    for (const file of ['run-worker.js', 'worker-config.js']) copyFileSync(new URL(`../scripts/${file}`, import.meta.url), join(fixture, 'scripts', file));
    copyFileSync(new URL('../src/branding.json', import.meta.url), join(fixture, 'src/branding.json'));
    copyFileSync(new URL('../dist/worker.js', import.meta.url), join(fixture, 'dist/worker.js'));
    writeFileSync(join(fixture, 'package.json'), '{"type":"module"}');
    symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(fixture, 'node_modules'), 'dir');
    const settings = {
        accID: '00000000000000000000000000000001', accEmail: 'cli@example.com', apiToken: 'test-only-not-a-cloudflare-token',
        vlUUID: '00000000-0000-4000-8000-000000000001', trPass: 'cli-test-only', securePath: 'cli-test-private-path',
        mainDomain: 'hesari-cli.example.workers.dev', kvNamespaceId: '00000000000000000000000000000001'
    };
    writeFileSync(join(fixture, '.local/settings.json'), JSON.stringify(settings));
    const cli = join(fixture, 'scripts/run-worker.js');
    const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(logDirectory, 'wrangler.log') };
    const dryRun = spawn(process.execPath, [cli, 'dry-run'], { cwd: fixture, env });
    let output = '';
    for (const stream of [dryRun.stdout, dryRun.stderr]) stream.on('data', chunk => { output += chunk; });
    const [code] = await once(dryRun, 'exit');
    assert.equal(code, 0, output);
    const config = JSON.parse(readFileSync(join(fixture, '.local/wrangler.json'), 'utf8'));
    assert.equal(config.main, 'runtime/worker.js');
    const prepared = readFileSync(join(fixture, '.local/runtime/worker.js'), 'utf8');
    const profile = parseWorkerBundle(prepared).profile;
    assert.equal(config.kv_namespaces[0].binding, profile.kvBinding);
    assert.match(profile.kvBinding, /^[a-z][a-f0-9]{24}$/);
    assert.equal(config.kv_namespaces[0].id, settings.kvNamespaceId);
    assert.ok(!JSON.stringify(config).includes(settings.apiToken));

    const portProbe = createServer();
    await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
    const port = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    const dev = spawn(process.execPath, [cli, 'dev', '--ip', '127.0.0.1', '--port', String(port)], { cwd: fixture, env });
    let devOutput = '';
    for (const stream of [dev.stdout, dev.stderr]) stream.on('data', chunk => { devOutput = (devOutput + chunk).slice(-4000); });
    try {
        const url = `http://127.0.0.1:${port}`;
        let panel;
        for (let attempt = 0; attempt < 100; attempt++) {
            try { panel = await fetch(`${url}/${settings.securePath}/panel`, { signal: AbortSignal.timeout(1000) }); break; }
            catch { await new Promise(resolve => setTimeout(resolve, 200)); }
        }
        assert.ok(panel, `Local Worker did not start: ${devOutput}`);
        assert.equal(panel.status, 200);
        assert.equal(JSON.parse(readFileSync(join(fixture, '.local/wrangler.json'), 'utf8')).kv_namespaces[0].binding, profile.kvBinding);
        assert.ok((await panel.text()).includes('HESARI OS'));
        const denied = await fetch(`${url}/${settings.securePath}/panel/settings`);
        assert.equal(denied.status, 401);
        const setup = await fetch(`${url}/${settings.securePath}/panel/reset-password`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: settings.accEmail, password: 'CliPassword!123' })
        });
        assert.equal(setup.status, 200);
        const login = await fetch(`${url}/${settings.securePath}/login/authenticate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: settings.accEmail, password: 'CliPassword!123' })
        });
        assert.equal(login.status, 200);
        assert.match(login.headers.get('set-cookie'), /jwtToken=/);
    } finally {
        dev.kill('SIGTERM');
        await once(dev, 'exit');
    }
});
