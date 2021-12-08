const os = require('os');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const url = require('url');

const Koa = require('koa');
const Router = require('@koa/router');
const killable = require('killable');
const EventEmitter = require('events').EventEmitter;

const middlewares = ['alive', 'backend', 'frontend', 'dist'].map(file => {
    return require(path.join(__dirname, './middlewares', file));
});

const CA = require('./CA');
const findCacheDir = require('./utils/findCacheDir');
const logger = require('./utils/logger');
const WebSocketServer = require('./WebSocketServer');
const ProxyServer = require('./ProxyServer');
const CDPMessager = require('./proxy/CDPMessager');

class Server extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.hostname = options.hostname;
        this.port = options.port;
        this._proxyServer = null;
        this._wsServer = null;
        // 插件处理
        this._middlewares = [];
        this._frontends = [];
        this._backends = [];
        (options.plugins || []).forEach(({backend, frontend, middleware}) => {
            backend && this._backends.push(backend);
            frontend && this._frontends.push(frontend);
            middleware && this._middlewares.push(middleware);
        });

        this.options.proxy = this.options.proxy || process.env.PROXY || false;
        // 统一ca地址

        this.distPath = path.join(__dirname, '../dist');
    }
    getDistPath() {
        return this.distPath;
    }
    _addRouters() {
        const router = (this.router = new Router());
        // 插件添加的middleware
        this._middlewares.forEach(middleware => {
            middleware(router, logger, this);
        });
        // 默认的middleware
        middlewares.forEach(middleware => {
            middleware(router, logger, this);
        });

        this.app.use(router.routes());
    }
    isSSL() {
        return !!this.options.https;
    }
    _start() {
        if (this.app) {
            // 保证执行一次
            return;
        }
        this._createServer();
    }
    async _setupHttps() {
        if (!this.options.https) {
            return;
        }
        const httpsOptions = this.options.https;
        const readFile = item => {
            if (Buffer.isBuffer(item) || (typeof item === 'object' && item !== null && !Array.isArray(item))) {
                return item;
            }

            if (item) {
                let stats = null;

                try {
                    stats = fs.lstatSync(fs.realpathSync(item)).isFile();
                } catch (error) {
                    // Ignore
                }

                return stats ? fs.readFileSync(item) : item;
            }
        };
        for (const property of ['ca', 'cert', 'crl', 'key', 'pfx']) {
            if (typeof httpsOptions[property] === 'undefined') {
                // eslint-disable-next-line no-continue
                continue;
            }
            const value = httpsOptions[property];
            httpsOptions[property] = Array.isArray(value) ? value.map(item => readFile(item)) : readFile(value);
        }

        let fakeCert;

        if (!httpsOptions.key || !httpsOptions.cert) {
            const dir = findCacheDir('ssl');
            fakeCert = await CA.getServerCA(dir);
        }

        httpsOptions.key = httpsOptions.key || fakeCert;
        httpsOptions.cert = httpsOptions.cert || fakeCert;
        this.options.https = httpsOptions;
    }
    async _wrapContext(ctx, next) {
        ctx.getWebSocketServer = () => {
            return this._wsServer;
        };
        await next();
    }
    _createServer() {
        this.app = new Koa();
        this.app.use(this._wrapContext.bind(this));
        this._addRouters();
        const options = this.options;
        if (options.https) {
            this._server = https.createServer(options.https, this.app.callback());
        } else {
            this._server = http.createServer(this.app.callback());
        }

        this._server.on('error', err => {
            logger.error(err);
        });
        killable(this._server);
    }
    _createProxyServer() {
        if (this._proxyServer) {
            return;
        }

        let proxy = this.options.proxy;

        if (proxy) {
            proxy = typeof proxy === 'boolean' ? {} : proxy;
            const proxyServer = (this._proxyServer = new ProxyServer(proxy, this));
            this._proxyServer.listen();
            setTimeout(() => {
                CDPMessager(this.getWsUrl(), proxyServer);
            }, 1e3);
        }
    }
    getProxyServer() {
        return this._proxyServer;
    }
    _createWebSocketServer() {
        if (this._wsServer) {
            return;
        }
        const wss = new WebSocketServer(this);
        this._wsServer = wss;
        wss.init(this._server);
    }
    async listen(port = 8001, hostname = '0.0.0.0', fn) {
        this.hostname = hostname;
        this.port = port;
        await this._setupHttps();
        this._start();

        return this._server.listen(port, hostname, err => {
            this._createWebSocketServer();
            this._createProxyServer();
            if (typeof fn === 'function') {
                fn.call(this._server, err);
            }
        });
    }
    getHostname() {
        return this.hostname;
    }
    getPort() {
        return this.port;
    }
    getUrl(pathname = '/', query = '') {
        return url.format({
            hostname: this.getAddress(),
            protocol: this.options.https ? 'https:' : 'http:',
            port: this.port,
            pathname: pathname,
            query: query
        });
    }
    getWsUrl(pathname = '/', query = '') {
        return url.format({
            hostname: this.getAddress(),
            protocol: this.options.https ? 'wss:' : 'ws:',
            port: this.port,
            pathname: pathname,
            query: query
        });
    }
    getAddress() {
        if (this._realHost) {
            return this._realHost;
        }
        if (this.hostname !== '0.0.0.0' && this.hostname !== '127.0.0.1' && this.hostname !== 'localhost') {
            this._realHost = this.hostname;
            return this._realHost;
        }
        const ifaces = os.networkInterfaces();
        const keys = Object.keys(ifaces);
        for (let i = 0; i < keys.length; i++) {
            const dev = ifaces[keys[i]];
            for (let j = 0; j < dev.length; j++) {
                const details = dev[j];
                if (details.family === 'IPv4' && details.address !== '0.0.0.0' && details.address !== '127.0.0.1') {
                    this._realHost = details.address;
                    return this._realHost;
                }
            }
        }
        return this.hostname;
    }
    getChannelManager() {
        return this._wsServer && this._wsServer.getChannelManager();
    }
    close() {
        this._wsServer.destory();
        this._server.kill();
        this._proxyServer && this._proxyServer.close();
        CDPMessager && CDPMessager.close();
    }
}

module.exports = Server;
