import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { configureWorker, getInstallationProfile, compatibilityDate, compatibilityFlags } from './worker-config.js';

try {
    const mode = process.argv[2];
    if (!['dev', 'deploy', 'dry-run'].includes(mode)) throw new Error('Use npm run dev, npm run deploy or npm run deploy:check.');
    const root = fileURLToPath(new URL('../', import.meta.url));
    let settings;
    try { settings = JSON.parse(readFileSync(new URL('../.local/settings.json', import.meta.url), 'utf8')); }
    catch (error) {
        if (error.code === 'ENOENT') throw new Error('Create .local/settings.json from settings.example.json and enter your account settings first. See README.md.');
        throw new Error('Unable to parse .local/settings.json. Check that it contains valid JSON.');
    }
    if (mode !== 'dev' && !settings.kvNamespaceId) throw new Error('Set kvNamespaceId to your existing Cloudflare KV namespace ID before deployment.');
    const configured = await configureWorker(settings, { root });
    const profile = getInstallationProfile(settings, { root });
    // Keep the watched module separate from persistent KV and deployment output.
    const runtimeDirectory = join(root, '.local/runtime');
    mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
    writeFileSync(join(runtimeDirectory, 'worker.js'), readFileSync(configured), { mode: 0o600 });
    const config = {
        name: settings.mainDomain.split('.')[0], main: 'runtime/worker.js', account_id: settings.accID,
        compatibility_date: compatibilityDate, compatibility_flags: compatibilityFlags,
        workers_dev: true, no_bundle: true,
        kv_namespaces: [{ binding: profile.kvBinding, ...(settings.kvNamespaceId ? { id: settings.kvNamespaceId } : {}) }]
    };
    const configPath = fileURLToPath(new URL('../.local/wrangler.json', import.meta.url));
    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    const require = createRequire(import.meta.url);
    const wranglerPackagePath = require.resolve('wrangler/package.json');
    const wranglerPackage = JSON.parse(readFileSync(wranglerPackagePath, 'utf8'));
    const wrangler = join(dirname(wranglerPackagePath), wranglerPackage.bin.wrangler);
    const args = mode === 'dev'
        ? ['dev', '--local', '--config', configPath, '--persist-to', '.local/state', ...process.argv.slice(3)]
        : ['deploy', '--config', configPath, ...(mode === 'dry-run' ? ['--dry-run', '--outdir', '.local/deploy-check'] : []), ...process.argv.slice(3)];
    if (mode === 'dev') console.log(`Local Worker: /${settings.securePath}/panel — real authentication, local KV and configuration APIs.`);
    const child = spawn(process.execPath, [wrangler, ...args], {
        cwd: root, stdio: 'inherit',
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false', ...(mode === 'dev' ? {} : { CLOUDFLARE_API_TOKEN: settings.apiToken, CLOUDFLARE_ACCOUNT_ID: settings.accID }) }
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
