import { EmbededSettings } from './settings';
import { RuntimeProfile } from '../common/worker-bundle';

declare global {
    interface Env {
        readonly CF_PAGES: string;
        readonly kv: KVNamespace;
        readonly [name: string]: string | KVNamespace | undefined;
        readonly bpb?: KVNamespace;
        readonly en?: KVNamespace;
        readonly UUID?: string;
        readonly TR_PASS?: string;
    }

    const _R_SOURCE_: string;
    const _R_CONFIG_: EmbededSettings;
    const VERSION: string;
    const _R_ERROR_: string;
    const _R_PANEL_: string;
    const _R_LOGIN_: string;
    const _R_PROXY_: string;
    const _R_ICON_: string;
    const _R_PROTOCOLA_: string;
    const _R_PROTOCOLALABEL_: string;
    const _R_PROTOCOLC_: string;
    const _R_PROTOCOLCLABEL_: string;
    const _R_PROTOCOLB_: string;
    const _R_PROTOCOLBLABEL_: string;
    const _R_PROTOCOLD_: string;
    const _R_CLIENT_: string;
    const _R_PROJECT_: string;
    const _R_SLUG_: string;
    const _R_REPOSITORY_: string;
    const _R_WIZARD_: string;
    const _R_WEBSITE_: string;
    const _R_PROXYHOST_: string;
    const _R_PROFILE_: RuntimeProfile;

    interface Array<T> {
        concatIf<T>(condition: boolean, concat: T | T[]): T[];
    }

    interface Object {
        omitEmpty<T>(): T | undefined;
    }
}

export { };
