import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { configureWorker, getInstallationProfile } from './worker-config.js';

// Credentials enter through stdin and stay in ignored .local/ artifacts.
try {
    if (process.stdin.isTTY) throw new Error('Pass your settings JSON through stdin: npm run configure < .local/settings.json');
    const settings = JSON.parse(readFileSync(0, 'utf8'));
    const root = fileURLToPath(new URL('../', import.meta.url));
    const output = await configureWorker(settings, { root });
    const profile = getInstallationProfile(settings, { root });
    console.log(`Configured worker: ${output}\nKV binding: ${profile.kvBinding}\nThis file contains account settings. Do not commit or share it.\nBack up .local/identifiers.json to preserve this installation's variable names.`);
} catch (error) {
    console.error(error instanceof SyntaxError ? 'Settings must be valid JSON.' : error.message);
    process.exitCode = 1;
}
