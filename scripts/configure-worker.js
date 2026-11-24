import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { configureWorker } from './worker-config.js';

// Credentials enter through stdin and stay in ignored .local/ artifacts.
try {
    if (process.stdin.isTTY) throw new Error('Pass your settings JSON through stdin: npm run configure < .local/settings.json');
    const settings = JSON.parse(readFileSync(0, 'utf8'));
    const output = configureWorker(settings, { root: fileURLToPath(new URL('../', import.meta.url)) });
    console.log(`Configured worker: ${output}\nThis file contains account settings. Do not commit or share it.`);
} catch (error) {
    console.error(error instanceof SyntaxError ? 'Settings must be valid JSON.' : error.message);
    process.exitCode = 1;
}
