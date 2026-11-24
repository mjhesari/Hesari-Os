import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRuntimeProfile, personalizeWorkerBundle, validateRuntimeProfile } from '../src/common/worker-bundle.js';

export const compatibilityDate = '2026-06-03';
export const compatibilityFlags = ['nodejs_compat'];

export function validateDeploymentSettings(settings) {
    for (const key of ['accID', 'accEmail', 'apiToken', 'vlUUID', 'trPass', 'securePath', 'mainDomain']) {
        if (typeof settings[key] !== 'string' || !settings[key].trim()) throw new Error(`Missing required setting: ${key}`);
        if (/^(YOUR_|REPLACE_)/i.test(settings[key])) throw new Error(`Replace the example value for ${key} with your own setting.`);
    }
    if (!/^[\w-]+$/.test(settings.securePath)) throw new Error('securePath may contain letters, digits, underscores and hyphens.');
    if (!/^[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}$/i.test(settings.mainDomain)) throw new Error('mainDomain must be your deployment hostname, without a scheme or path.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(settings.vlUUID)) throw new Error('vlUUID must be a version 4 UUID (generate one with crypto.randomUUID()).');
    const embedded = Object.fromEntries(['accID', 'accEmail', 'apiToken', 'vlUUID', 'trPass', 'securePath', 'mainDomain'].map(key => [key, settings[key].trim()]));
    Object.assign(embedded, {
        accEmail: embedded.accEmail.toLowerCase(),
        proxyIpMode: settings.proxyIpMode || 'proxyip',
        proxyIPs: settings.proxyIPs ?? [],
        prefixes: settings.prefixes ?? [],
        fallback: settings.fallback ?? '',
        dohUrl: settings.dohUrl ?? ''
    });
    if (!['proxyip', 'prefix'].includes(embedded.proxyIpMode)) throw new Error('proxyIpMode must be proxyip or prefix (NAT64).');
    for (const key of ['proxyIPs', 'prefixes']) {
        if (!Array.isArray(embedded[key]) || !embedded[key].every(value => typeof value === 'string')) throw new Error(`${key} must be an array of strings.`);
    }
    for (const key of ['fallback', 'dohUrl']) if (typeof embedded[key] !== 'string') throw new Error(`${key} must be a string.`);
    if (settings.kvNamespaceId && !/^[a-f\d]{32}$/i.test(settings.kvNamespaceId)) throw new Error('kvNamespaceId must be a Cloudflare KV namespace ID (32 hexadecimal characters).');
    return embedded;
}

export function getInstallationProfile(settings, { root = process.cwd() } = {}) {
    const path = join(root, '.local/identifiers.json');
    let registry;
    try {
        registry = JSON.parse(readFileSync(path, 'utf8'));
        if (registry.version !== 1 || !registry.installations || typeof registry.installations !== 'object' || Array.isArray(registry.installations)) throw new Error('Invalid registry');
        Object.values(registry.installations).forEach(validateRuntimeProfile);
    } catch (error) {
        if (error.code !== 'ENOENT') throw new Error('Cannot read .local/identifiers.json. Restore it from your installation backup; identifiers were not regenerated.');
        registry = { version: 1, installations: {} };
    }
    const key = `${settings.accID.trim()}/${settings.mainDomain.trim().toLowerCase()}`;
    if (!registry.installations[key]) {
        registry.installations[key] = createRuntimeProfile();
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        writeFileSync(path, JSON.stringify(registry, null, 2), { mode: 0o600 });
    }
    chmodSync(path, 0o600);
    return registry.installations[key];
}

export async function configureWorker(settings, { root = process.cwd() } = {}) {
    const embedded = validateDeploymentSettings(settings);
    const source = readFileSync(join(root, 'dist/worker.js'), 'utf8');
    const output = join(root, '.local/worker.js');
    const profile = getInstallationProfile(settings, { root });
    const worker = await personalizeWorkerBundle(source, profile, embedded);
    mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
    writeFileSync(output, worker, { mode: 0o600 });
    chmodSync(output, 0o600);
    return output;
}
