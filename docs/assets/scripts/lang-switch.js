const languageScriptUrl = document.currentScript?.src;
function updateLanguageLink() {
    const langLink = document.querySelector('a[hreflang="fa"], a[hreflang="en"]');
    if (!langLink) return;
    const currentPath = window.location.pathname;
    if (!languageScriptUrl) return;
    const base = new URL(languageScriptUrl).pathname.replace(/\/(?:fa\/)?scripts\/lang-switch\.js$/, '');

    let newPath;
    if (currentPath.startsWith(`${base}/fa/`)) {
        newPath = currentPath.replace(`${base}/fa`, base);
    } else {
        newPath = currentPath.replace(base, `${base}/fa`);
    }

    langLink.setAttribute("href", newPath);
}
if (globalThis.document$) globalThis.document$.subscribe(updateLanguageLink);
else document.addEventListener("DOMContentLoaded", updateLanguageLink);
