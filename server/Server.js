const os = require('os');
const http = require('http');
const https = require('https');
const path = require('path');
const url = require('url');
const fs = require('fs');

const Koa = require('koa');
const Router = require('@koa/router');
const killable = require('killable');
const EventEmitter = require('events').EventEmitter;
const findCacheDir = require('./utils/findCacheDir');
const CA = require('./CA');

const middlewares = ['alive', 'backend', 'frontend', 'dist'].map(file => {
    return require(path.join(__dirname, './middlewares', file));
});

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
        this.ca = new CA(options.sslCaDir || findCacheDir('ssl'));
        this.sslCaDir = this.ca.baseCAFolder;
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
    async _setupHttps() {
        // 创建ca
        await this.ca.create();
        if (this.options.https) {
            this.options.https.key = fs.readFileSync(this.ca.caPrivateFilepath, 'utf8');
            this.options.https.cert = fs.readFileSync(this.ca.caFilepath, 'utf8');
        }
    }
    _start() {
        if (this.app) {
            // 保证执行一次
            return;
        }
        this._createServer();
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
