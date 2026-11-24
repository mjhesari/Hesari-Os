import { decompressGzipBase64, HttpStatus, safeError } from '@common';
import brand from '../branding.json' with { type: 'json' };

export async function renderError(error: any): Promise<Response> {
    console.error(`${brand.name} request failed:`, error);
    try {
        const str = await decompressGzipBase64(_R_ERROR_);
        const message = safeError(error).replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]!);
        const html = str
            .replace('__ERROR_MESSAGE__', () => message)
            .replaceAll('__ICON__', _R_ICON_);

        return new Response(html, {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
        });
    } catch {
        // Error handling must still return a response if an embedded asset is damaged.
        return new Response(`${brand.name}: Internal Server Error. Check the Worker configuration.`, {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
    }
}
