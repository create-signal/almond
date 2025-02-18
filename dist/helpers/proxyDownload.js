"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
async function proxyPrivateDownload(asset, token, req, res) {
    const redirect = 'manual';
    const headers = { Accept: 'application/octet-stream', Authorization: `token ${token}` };
    const { api_url: rawUrl } = asset;
    // const finalUrl = rawUrl.replace(
    //     'https://api.github.com/',
    //     `https://${token}@api.github.com/`
    // )
    const assetRes = await fetch(rawUrl, {
        headers,
        redirect,
    });
    res.setHeader('Location', assetRes.headers.get('Location') || "");
    res.status(302);
}
exports.default = proxyPrivateDownload;
//# sourceMappingURL=proxyDownload.js.map