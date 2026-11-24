import { handleDoH } from '@handlers/doh';
import { renderError } from '@handlers/error';
import { handleLogin } from '@handlers/login';
import { handlePanel } from '@handlers/panel';
import { handleProxyIPs } from '@handlers/proxy-ip';
import { generateQRCode } from '@handlers/qrcode';
import { handleSubscriptions } from '@handlers/subscription';
import { handleTelegram } from '@handlers/telegram';
import { fallback } from '@handlers/utils';
import { handleWebsocket } from '@handlers/websocket';
import { init, getGlobals } from '@settings';

export default {
	async fetch(request: Request, env: Env) {
		try {
			init(request, env);
			if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') return await handleWebsocket(request);
			// Keep the existing namespace data when migrating a binding name.
			const kv = env[_R_PROFILE_.kvBinding] ?? env.kv ?? env.bpb ?? env.en;
			if (!kv || typeof kv === 'string') throw new Error(`Missing KV binding. Bind your existing namespace as "${_R_PROFILE_.kvBinding}" in Workers / Pages settings.`);
			env = { ...env, kv };
			const { securePath, pathname } = getGlobals();
			const path = pathname.split('/').splice(0, 3).join('/');

			switch (path) {
				case `/${securePath}/panel`:
					return await handlePanel(request, env);

				case `/${securePath}/login`:
					return await handleLogin(request, env);

				case `/${securePath}/sub`:
					return await handleSubscriptions(request, env);

				case `/${securePath}/telegram`:
					return await handleTelegram(request, env);

				case `/${securePath}/dns-query`:
					return await handleDoH(request);

				case `/${securePath}/proxy-ip`:
					return await handleProxyIPs(request, env);
				
				case `/${securePath}/qrcode`:
					return await generateQRCode(request);
					
				default:
					return await fallback(request);
			}
		} catch (error) {
			return renderError(error);
		}
	}
}
