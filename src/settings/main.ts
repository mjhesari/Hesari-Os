import { EmbededSettings, MainSettings, PanelSettings } from '#types/settings';
import { deployPages, getPagesDomains, setPagesDomain } from '@api/pages';
import { deployWorkers, getWorkerDomains, setWorkerDomain } from '@api/workers';
import { getGlobals, getMainSettings, getSettings } from '@settings';
import { createCNAME, listZones } from '@api/dns';
import { decompressGzipBase64, safeError } from '@common';
import brand from '../branding.json' with { type: 'json' };
import { encodeWorkerBundle, personalizeWorkerBundle } from '../common/worker-bundle.js';

export async function updateMainSettings(newSettings: PanelSettings | null): Promise<Partial<EmbededSettings>> {
    const { accID, accEmail, apiToken, mainDomain, vlUUID, trPass, securePath } = getGlobals();
    const settings: EmbededSettings = {
        accID,
        accEmail,
        apiToken,
        vlUUID: newSettings ? newSettings.vlUUID : vlUUID,
        trPass: newSettings ? newSettings.trPass : trPass,
        securePath: newSettings ? newSettings.securePath : securePath,
        proxyIpMode: newSettings ? newSettings.proxyIpMode : 'proxyip',
        proxyIPs: newSettings ? newSettings.proxyIPs : [],
        prefixes: newSettings ? newSettings.prefixes : [],
        mainDomain,
        fallback: newSettings ? newSettings.fallback : '',
        dohUrl: newSettings ? newSettings.dohUrl : ''
    };

    if (newSettings) {
        const same = compareMainSettings(settings);
        if (same) return {};
    }

    try {
        const script = await buildScript(false, settings);
        const { deployType } = getSettings();

        if (deployType === 'pages') {
            await deployPages(script);
        } else {
            await deployWorkers(script);
        }

        return settings;
    } catch (error) {
        throw new Error(`An error occurred while updating Env vars: ${safeError(error)}`);
    }
}

function compareMainSettings(settings: MainSettings): boolean {
    const mainSettings = getMainSettings();
    const keys = Object.keys(mainSettings) as Array<keyof MainSettings>;

    return keys.every(key => {
        const envValue = mainSettings[key];
        const settingValue = settings[key];
        if (Array.isArray(envValue) && Array.isArray(settingValue)) {
            return envValue.join(',') === settingValue.join(',');
        }

        return envValue === settingValue;
    });
}

export async function setCustomDomain(customDomain: string) {
    if (!customDomain) return;
    const { deployType } = getGlobals();

    try {
        const tld = customDomain.split('.').slice(-2).join('.');
        const dnsZones = await listZones();
        const zone = dnsZones?.find((z: any) => z.name === tld);
        if (!zone) throw new Error(`Specified domain ${tld} is not registered on your Cloudflare account.`);
        const zoneID = zone.id;
        const customDomains = deployType === 'workers'
            ? await getWorkerDomains()
            : await getPagesDomains();

        if (customDomains.includes(customDomain)) {
            throw new Error(`Custom domain '${customDomain}' is already added to ${deployType}.`);
        }

        if (deployType === 'pages') {
            await setPagesDomain(customDomain);
            await createCNAME(zoneID, customDomain);
        } else {
            await setWorkerDomain(customDomain);
        }

        return customDomain;
    } catch (error) {
        throw new Error(`Failed to set Custom Domain: ${safeError(error)}`);
    }
}

export async function buildScript(upgradePanel: boolean, settings?: MainSettings): Promise<string> {
    let script = '';

    if (!settings) {
        const source = brand.updates.workerUrl;
        if (!source) throw new Error('Updates are disabled. Configure your own fork update URLs in src/branding.json and rebuild.');
        const sourceUrl = new URL(source);
        if (sourceUrl.protocol !== 'https:') throw new Error('The update source must use HTTPS.');
        const res = await fetch(sourceUrl);
        if (!res.ok) throw new Error(`Failed to download the panel update (HTTP ${res.status}).`);
        script = await res.text();
        settings = getSettings();
    } else {
        script = await decompressGzipBase64(_R_SOURCE_);
    }

    const { accID, accEmail, apiToken, mainDomain } = getGlobals();
    const embededSettings = {
        accID,
        accEmail,
        apiToken,
        vlUUID: settings.vlUUID,
        trPass: settings.trPass,
        securePath: settings.securePath,
        proxyIpMode: settings.proxyIpMode,
        proxyIPs: settings.proxyIPs,
        prefixes: settings.prefixes,
        fallback: settings.fallback,
        dohUrl: settings.dohUrl,
        mainDomain
    };

    if (upgradePanel) return personalizeWorkerBundle(script, _R_PROFILE_, embededSettings);

    return encodeWorkerBundle(script, {
        panel: _R_PANEL_, login: _R_LOGIN_, error: _R_ERROR_, proxy: _R_PROXY_, icon: _R_ICON_
    }, _R_PROFILE_, embededSettings);
}
