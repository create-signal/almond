"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const morgan_1 = __importDefault(require("morgan"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const cache_1 = require("./helpers/cache");
const middlewares = __importStar(require("./middlewares"));
const express_useragent_1 = require("express-useragent");
const proxyDownload_1 = __importDefault(require("./helpers/proxyDownload"));
const aliases_1 = __importDefault(require("./helpers/aliases"));
const semver_1 = require("semver");
const url_1 = __importDefault(require("url"));
const consola_1 = __importDefault(require("consola"));
require('dotenv').config();
const app = (0, express_1.default)();
app.use((0, morgan_1.default)('dev'));
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const cache = new cache_1.Cache({
    token: process.env.TOKEN || "",
    repository: process.env.REPOSITORY || "",
    account: process.env.ACCOUNT || "",
    url: process.env.URL || "",
    pre: process.env.PRE || "",
});
const shouldProxyPrivateDownload = cache.config.token.length > 0;
app.get('/version', async (req, res) => {
    const latest = await cache.loadCache();
    consola_1.default.log(`Request for latest version from ${req.useragent} | ${req.ip}`);
    if (!latest)
        return res.status(500).send('Latest not found.');
    return res.send({ version: latest.version, notes: latest.notes, pub_date: latest.pub_date });
});
app.get('/download', async (req, res) => {
    const userAgent = (0, express_useragent_1.parse)(req.headers['user-agent'] || "");
    const params = url_1.default.parse(req.url, true).query;
    const isUpdate = params && params.update;
    let platform;
    if (userAgent.isMac && isUpdate) {
        platform = 'darwin';
    }
    else if (userAgent.isMac && !isUpdate) {
        platform = 'dmg';
    }
    else if (userAgent.isWindows) {
        platform = 'exe';
    }
    else {
        platform = '';
    }
    consola_1.default.log(`Request for download from ${req.useragent} | ${req.ip}`);
    // Get the latest version from the cache
    const { platforms } = await cache.loadCache();
    const findPlatform = platforms.find((v) => v.platform == platform);
    if (!platform || !platforms || !findPlatform) {
        res.status(404).send('No download available for your platform!');
        return;
    }
    if (shouldProxyPrivateDownload) {
        await (0, proxyDownload_1.default)(findPlatform, cache.config.token, req, res);
        return;
    }
    res.writeHead(302, {
        Location: findPlatform.url
    });
    res.end();
});
app.get('/download/:platform', async (req, res) => {
    const params = url_1.default.parse(req.url, true).query;
    const isUpdate = params && params.update;
    let { platform } = req.params;
    if (platform === 'mac' && !isUpdate) {
        platform = 'dmg';
    }
    if (platform === 'mac_arm64' && !isUpdate) {
        platform = 'dmg_arm64';
    }
    consola_1.default.log(`Request for ${platform} download from ${req.useragent} | ${req.ip}`);
    // else platform = ''
    // Get the latest version from the cache
    const latest = await cache.loadCache();
    // Check platform for appropriate aliases
    platform = (0, aliases_1.default)(platform);
    // console.log(platform)
    const findPlatform = cache.cache.latest.platforms.find((v) => v.platform == platform);
    // console.log(findPlatform)
    if (!platform) {
        res.status(500).send('The specified platform is not valid');
        return;
    }
    if (!latest.platforms || !platform) {
        res.status(404).send('No download available for your platform');
        return;
    }
    if (cache.config.token && cache.config.token.length > 0) {
        await (0, proxyDownload_1.default)(findPlatform, cache.config.token, req, res);
        return;
    }
    res.writeHead(302, {
        Location: latest.platforms.find((v) => v.platform == platform)?.url
    });
    res.end();
});
app.get('/update/:platform/:version', async (req, res) => {
    const { platform: platformName, version } = req.params;
    if (!(0, semver_1.valid)(version)) {
        res.status(500).send({
            error: 'version_invalid',
            message: 'The specified version is not SemVer-compatible'
        });
        return;
    }
    await cache.loadCache();
    const platform = (0, aliases_1.default)(platformName);
    const findPlatform = cache.cache.latest.platforms.find((v) => v.platform == platform);
    if (!findPlatform) {
        res.status(500).send({
            error: 'invalid_platform',
            message: 'The specified platform is not valid'
        });
        return;
    }
    consola_1.default.log(`Request for ${platform} download of version ${version} from ${req.useragent} | ${req.ip}`);
    // Get the latest version from the cache
    const latest = await cache.loadCache();
    if (!latest.platforms || !findPlatform) {
        res.statusCode = 204;
        res.end();
        return;
    }
    // Previously, we were checking if the latest version is
    // greater than the one on the client. However, we
    // only need to compare if they're different (even if
    // lower) in order to trigger an update.
    // This allows developers to downgrade their users
    // to a lower version in the case that a major bug happens
    // that will take a long time to fix and release
    // a patch update.
    if ((0, semver_1.compare)(latest.version, version) !== 0) {
        const { notes, pub_date } = latest;
        res.status(200).send({
            name: latest.version,
            notes,
            pub_date,
            url: shouldProxyPrivateDownload
                ? `${cache.config.url}/download/${platformName}?update=true`
                : findPlatform.url
        });
        return;
    }
    res.statusCode = 204;
    res.end();
});
app.get('/overview', async (req, res) => {
});
app.get('/releases', async (req, res) => {
    // Get the latest version from the cache
    const latest = await cache.loadCache();
    if (!latest.files || !latest.files.releases) {
        res.statusCode = 204;
        res.end();
        return;
    }
    consola_1.default.log(`Request for releases from ${req.useragent} | ${req.ip}`);
    const content = latest.files.releases;
    res.writeHead(200, {
        'content-length': Buffer.byteLength(content, 'utf8'),
        'content-type': 'application/octet-stream'
    });
    res.end(content);
});
app.use(middlewares.notFound);
app.use(middlewares.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map