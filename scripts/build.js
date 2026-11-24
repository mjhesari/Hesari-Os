import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { minify as jsMinify } from 'terser';
import { renderAsset, brandIcon } from './assets.js';
import pkg from '../package.json' with { type: 'json' };
import { gzipSync } from 'zlib';
import { compilerNames, createRuntimeProfile, encodeWorkerBundle, renameRuntimeSymbols } from '../src/common/worker-bundle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const DIST_PATH = join(__dirname, '../dist/');
const development = process.argv.includes('--development');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

const success = `${green}✔${reset}`;
const failure = `${red}✗${reset}`;

async function processHtmlPages() {
    const result = {};

    for (const dir of ['panel', 'login', 'proxy-ip', 'error']) {
        const compressed = gzipSync(await renderAsset(dir, { minify: !development }), { level: 9 });
        result[dir] = compressed.toString('base64');
    }

    console.log(`${success} Assets bundled successfuly!`);
    return result;
}

async function buildWorker() {
    const htmls = await processHtmlPages();
    const faviconBase64 = Buffer.from(brandIcon()).toString('base64');

    const code = await build({
        entryPoints: [join(__dirname, '../src/worker.ts')],
        bundle: true,
        format: 'esm',
        write: false,
        external: [
            'cloudflare:sockets',
            'node:crypto'
        ],
        platform: 'browser',
        target: 'esnext',
        loader: { '.ts': 'ts' },
        define: { VERSION: `"${pkg.version}"` }
    });

    console.log(`${success} Worker built successfuly!`);

    const { code: script } = development ? { code: code.outputFiles[0].text } : await jsMinify(code.outputFiles[0].text, {
        module: true,
        output: {
            comments: false
        },
        compress: {
            dead_code: false,
            unused: false
        }
    });

    console.log(`${success} Worker minified successfuly!`);

    const profile = createRuntimeProfile();
    const worker = await encodeWorkerBundle(renameRuntimeSymbols(script, compilerNames, profile.names), {
        panel: htmls.panel, login: htmls.login, error: htmls.error, proxy: htmls['proxy-ip'], icon: faviconBase64
    }, profile);

    mkdirSync(DIST_PATH, { recursive: true });
    writeFileSync('./dist/worker.js', worker, 'utf8');
    writeFileSync(join(DIST_PATH, 'manifest.json'), JSON.stringify({ name: pkg.name, version: pkg.version }, null, 2));

    console.log(`${success} Done!`);
}

buildWorker().catch(err => {
    console.error(`${failure} Build failed:`, err);
    process.exit(1);
});

