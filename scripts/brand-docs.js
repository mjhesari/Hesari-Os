import { readFileSync, writeFileSync } from 'node:fs';
import { brandIcon, escapeHtml, validateBranding } from './assets.js';
import brand from '../src/branding.json' with { type: 'json' };

validateBranding();
for (const language of ['en', 'fa']) {
    const file = new URL(`../docs/${language}/mkdocs.yml`, import.meta.url);
    let yaml = readFileSync(file, 'utf8');
    yaml = yaml.replace(/^site_name:.*$/m, `site_name: ${JSON.stringify(brand.name)}`)
        .replace(/^site_url:.*\n/m, '')
        .replace(/^site_name:.*$/m, match => brand.documentationFormat === 'markdown' ? match : `${match}\nsite_url: ${JSON.stringify(`${brand.documentationUrl.replace(/\/$/, '')}/${language === 'fa' ? 'fa/' : ''}`)}`)
        .replace(/^repo_url:.*$/m, `repo_url: ${JSON.stringify(brand.repositoryUrl || brand.githubUrl)}`)
        .replace(/^repo_name:.*\n/m, '')
        .replace(/^copyright:.*$/m, `repo_name: ${JSON.stringify(brand.repositoryUrl ? brand.name : brand.owner)}\ncopyright: ${JSON.stringify(`${brand.name} by ${brand.owner} · Based on BPB Panel · GPL-3.0`)}`)
        .replaceAll('favicon.ico', 'favicon.svg')
        .replace(/link: https:\/\/github.com\/[^\s]+/g, `link: ${brand.repositoryUrl || brand.githubUrl}`)
        .replace(/link: \/BPB-Worker-Panel\/fa\//g, 'link: ./fa/')
        .replace(/link: \/BPB-Worker-Panel\//g, 'link: ../')
        .replace(/name: (?:Source code|GitHub profile)/, `name: ${brand.repositoryUrl ? 'Source code' : 'GitHub profile'}`)
        .replace(/(alternate:[\s\S]*?\n\s+link:) [^\n]+/, (_, prefix) => `${prefix} ${brand.documentationFormat === 'markdown' ? `${brand.repositoryUrl}/blob/main/docs/${language === 'en' ? 'fa' : 'en'}/docs/index.md` : `${brand.documentationUrl.replace(/\/$/, '')}/${language === 'en' ? 'fa/' : ''}`}`);
    writeFileSync(file, yaml);
}
writeFileSync(new URL('../docs/assets/favicon.svg', import.meta.url), brandIcon());
const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420"><rect width="1200" height="420" rx="24" fill="${brand.colors.background}"/><g fill="none" stroke="${brand.colors.accent}" opacity=".12"><path d="M0 80h1200M0 160h1200M0 240h1200M0 320h1200M80 0v420M160 0v420M240 0v420M320 0v420M400 0v420M480 0v420M560 0v420M640 0v420M720 0v420M800 0v420M880 0v420M960 0v420M1040 0v420M1120 0v420"/></g><text x="72" y="115" font-family="monospace" font-size="18" letter-spacing="4" fill="${brand.colors.accent}">PERSONAL COMMAND CENTER</text><text x="68" y="215" font-family="system-ui,sans-serif" font-size="76" font-weight="700" fill="#edf4ff">${escapeHtml(brand.name)}</text><text x="72" y="280" font-family="system-ui,sans-serif" font-size="30" fill="${brand.colors.secondary}">${escapeHtml(brand.tagline)}</text><text x="72" y="357" font-family="monospace" font-size="18" fill="#a8b8ce">NETWORK / INFRASTRUCTURE / DEVELOPER TOOLS</text></svg>`;
writeFileSync(new URL('../docs/assets/images/hesari-banner.svg', import.meta.url), banner);
console.log('Documentation identity synchronized.');
