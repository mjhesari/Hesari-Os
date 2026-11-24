import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify as jsMinify } from 'terser';
import { minify as htmlMinify } from 'html-minifier';
import brand from '../src/branding.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };

const assets = fileURLToPath(new URL('../src/assets/', import.meta.url));
export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

export function validateBranding(config = brand) {
    for (const key of ['name', 'shortName', 'owner', 'tagline', 'description', 'initials']) {
        if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error(`Missing branding.${key}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.slug)) throw new Error('Brand slug must be a lowercase filename-safe identifier.');
    for (const value of Object.values(config.colors)) {
        if (!/^#[a-f\d]{6}$/i.test(value)) throw new Error('Brand colors must use six-digit hex values.');
    }
    for (const value of [config.githubUrl, config.websiteUrl, config.repositoryUrl, config.documentationUrl, ...Object.values(config.updates)]) {
        if (value && new URL(value).protocol !== 'https:') throw new Error('Brand links must use HTTPS.');
    }
    if (Boolean(config.updates.manifestUrl) !== Boolean(config.updates.workerUrl)) {
        throw new Error('Configure both update manifestUrl and workerUrl, or leave both empty.');
    }
    if (config.documentationFormat && !['markdown', 'website'].includes(config.documentationFormat)) throw new Error('documentationFormat must be markdown or website.');
}

export function brandIcon() {
    const monogram = brand.initials === 'H'
        ? `<path d="M20 17v30m24-30v30M20 32h24" stroke="${brand.colors.accent}" stroke-width="6"/>`
        : `<text x="32" y="43" text-anchor="middle" font-family="monospace" font-size="30" font-weight="700" fill="${brand.colors.accent}">${escapeHtml(brand.initials)}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${brand.colors.background}"/><rect x="1" y="1" width="62" height="62" rx="17" fill="none" stroke="${brand.colors.accent}"/>${monogram}<circle cx="49" cy="15" r="4" fill="${brand.colors.secondary}"/></svg>`;
}

export async function renderAsset(page, { minify = true } = {}) {
    validateBranding();
    let html = readFileSync(join(assets, page, 'index.html'), 'utf8');
    let css = page === 'error' ? '' : readFileSync(join(assets, page, 'style.css'), 'utf8');
    css += readFileSync(join(assets, 'shared/theme.css'), 'utf8');
    css += `:root{--color-bg-main:${brand.colors.background};--color-brand-primary:${brand.colors.accent};--color-brand-hover:${brand.colors.secondary};--accent:${brand.colors.accent};--accent-secondary:${brand.colors.secondary}}`;
    if (page === 'error') html = html.replace('</style>', `${css}</style>`);
    else {
        const script = readFileSync(join(assets, page, 'script.js'), 'utf8');
        const config = JSON.stringify(brand).replace(/</g, '\\u003c');
        const bundledScript = `const BRAND = ${config};\n${script}`;
        const code = minify ? (await jsMinify(bundledScript)).code : bundledScript;
        html = html.replace('/* CSS_PLACEHOLDER */', () => css).replace('/* JS_PLACEHOLDER */', () => code);
    }
    const values = {
        VERSION: pkg.version,
        BRAND_NAME: brand.name,
        BRAND_SHORT_NAME: brand.shortName,
        BRAND_OWNER: brand.owner,
        BRAND_TAGLINE: brand.tagline,
        BRAND_DESCRIPTION: brand.description,
        BRAND_BACKGROUND: brand.colors.background,
        BRAND_GITHUB: brand.githubUrl,
        BRAND_REPO: brand.repositoryUrl || brand.githubUrl,
        BRAND_WEBSITE: brand.websiteUrl,
        BRAND_DOCS: brand.documentationUrl.replace(/\/$/, '')
    };
    html = html.replace(/href="__BRAND_DOCS__\/([^"<>]+)"/g, (_, path) => {
        const documentPath = path.replace(/\/$/, '');
        const suffix = brand.documentationFormat === 'markdown' ? '.md' : '/';
        return `href="${escapeHtml(`${brand.documentationUrl.replace(/\/$/, '')}/${documentPath}${suffix}`)}"`;
    });
    for (const [key, value] of Object.entries(values)) html = html.replaceAll(`__${key}__`, () => escapeHtml(value));
    return minify ? htmlMinify(html, { collapseWhitespace: true, removeAttributeQuotes: true, minifyCSS: true }) : html;
}
