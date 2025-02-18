"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cache = void 0;
const async_retry_1 = __importDefault(require("async-retry"));
const stream_to_string_1 = __importDefault(require("stream-to-string"));
const ms_1 = __importDefault(require("ms"));
// Utilities
const platform_1 = __importDefault(require("./platform"));
const axios_1 = __importDefault(require("axios"));
const consola_1 = __importDefault(require("consola"));
class Cache {
    constructor(config) {
        consola_1.default.debug('Cache constructor');
        const { account, repository, token, url } = config;
        this.config = config;
        this.cache = {
            lastUpdate: null,
            interval: 0,
            latest: {
                version: "",
                notes: "",
                pub_date: Date.now(),
                platforms: [],
                files: [],
            }
        };
        if (!account || !repository) {
            const error = new Error('Neither ACCOUNT, nor REPOSITORY are defined');
            error.name = 'missing_configuration_properties';
            throw error;
        }
        if (token && !url) {
            const error = new Error('Neither VERCEL_URL, nor URL are defined, which are mandatory for private repo mode');
            error.name = 'missing_configuration_properties';
            throw error;
        }
        this.cache.lastUpdate = null;
        // console.log(this.cache)
        consola_1.default.success('Cache successfully constructed!');
    }
    async cacheReleaseList(url) {
        const { token } = this.config;
        const headers = { Accept: 'application/vnd.github.preview' };
        if (token && token.length > 0) {
            headers.Authorization = `Token ${token}`;
        }
        const { status, body } = await (0, async_retry_1.default)(async () => {
            const response = await (0, axios_1.default)({
                url: url,
                method: "GET",
                headers,
                responseType: "arraybuffer"
            });
            if (response.status !== 200) {
                throw new Error(`Tried to cache RELEASES, but failed fetching ${url}, status ${status}`);
            }
            return response.data;
        }, { retries: 3 });
        if (!body)
            throw new Error(`Tried to cache RELEASES, but failed. RELEASES content doesn't contain nupkg`);
        let content = await (0, stream_to_string_1.default)(body);
        const matches = content.match(/[^ ]*\.nupkg/gim);
        if (!matches)
            throw new Error(`Tried to cache RELEASES, but failed. RELEASES content doesn't contain nupkg`);
        if (matches.length === 0)
            throw new Error(`Tried to cache RELEASES, but failed. RELEASES content doesn't contain nupkg`);
        for (let i = 0; i < matches.length; i += 1) {
            const nuPKG = url.replace('RELEASES', matches[i]);
            content = content.replace(matches[i], nuPKG);
        }
        return content;
    }
    async refreshCache() {
        const { account, repository, pre, token } = this.config;
        const repo = account + '/' + repository;
        const url = `https://api.github.com/repos/${repo}/releases?per_page=100`;
        const headers = { Accept: 'application/vnd.github.preview' };
        if (token && token.length > 0) {
            headers.Authorization = `token ${token}`;
        }
        const response = await (0, async_retry_1.default)(async () => {
            const response = await fetch(url, { headers });
            if (response.status !== 200) {
                consola_1.default.error(`GitHub API responded with ${response.status} for url ${url}`);
                return 500;
            }
            return response;
        }, { retries: 3 });
        if (typeof response === 'number') {
            return;
        }
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
            return;
        }
        const release = data.find(item => {
            const isPre = Boolean(pre) === Boolean(item.prerelease);
            return !item.draft && isPre;
        });
        if (!release || !release.assets || !Array.isArray(release.assets)) {
            return;
        }
        const { tag_name } = release;
        if (this.cache.latest.version === tag_name) {
            consola_1.default.log('Cached version is the same as latest');
            this.cache.lastUpdate = Date.now();
            return this.cache.latest;
        }
        consola_1.default.log(`Caching version ${tag_name}...`);
        this.cache.latest.version = tag_name;
        this.cache.latest.notes = release.body;
        this.cache.latest.pub_date = release.published_at;
        // Clear list of download links
        this.cache.latest.platforms = [];
        for (const asset of release.assets) {
            const { name, browser_download_url, url, content_type, size } = asset;
            if (name === 'RELEASES') {
                try {
                    if (!this.cache.latest.files) {
                        this.cache.latest.files = [];
                    }
                    this.cache.latest.files.releases = await this.cacheReleaseList(browser_download_url);
                }
                catch (err) {
                    console.error(err);
                }
                continue;
            }
            const platform = (0, platform_1.default)(name);
            if (!platform) {
                continue;
            }
            this.cache.latest.platforms.push({
                name,
                api_url: url,
                url: browser_download_url,
                content_type,
                size: Math.round(size / 1000000 * 10) / 10,
                platform: platform,
            });
        }
        consola_1.default.log(`Finished caching version ${tag_name}`);
        this.cache.lastUpdate = Date.now();
        return this.cache.latest;
    }
    isOutdated() {
        const { lastUpdate } = this.cache;
        const { interval = 15 } = this.cache;
        return !!(lastUpdate && Date.now() - lastUpdate > (0, ms_1.default)(`${interval}m`));
    }
    // This is a method returning the cache
    // because the cache would otherwise be loaded
    // only once when the index file is parsed
    async loadCache() {
        const { latest, lastUpdate } = this.cache;
        if (!lastUpdate || this.isOutdated()) {
            return Object.assign({}, await this.refreshCache());
        }
        return Object.assign({}, latest);
    }
}
exports.Cache = Cache;
//# sourceMappingURL=cache.js.map