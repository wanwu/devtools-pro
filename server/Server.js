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
const middlewares = ['alive', 'backend', 'frontend', 'dist', 'json_protocol'].map(file => {
    return require(path.join(__dirname, './middlewares', file));
});

const getCertificate = require('./utils/getCertificate');
const logger = require('lighthouse-logger');
const WebSocketServer = require('./WebSocketServer');

class Server extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.hostname = options.hostname;
        this.port = options.port;
        // 插件处理
        this._middlewares = [];
        this._frontends = [];
        this._backends = [];
        (options.plugins || []).forEach(({backend, frontend, middleware}) => {
            backend && this._backends.push(backend);
            frontend && this._frontends.push(frontend);
            middleware && this._middlewares.push(middleware);
        });

        this._setupHttps();
        this._start();
        this._addRouters();
    }
    _addRouters() {
        if (!this.app) {
            // TODO
        }
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
    _setupHttps() {
        if (this.options.https) {
            for (const property of ['ca', 'pfx', 'key', 'cert']) {
                const value = this.options.https[property];
                const isBuffer = value instanceof Buffer;

                if (value && !isBuffer) {
                    let stats = null;

                    try {
                        stats = fs.lstatSync(fs.realpathSync(value)).isFile();
                    } catch (error) {
                        // ignore error
                    }

                    // It is file
                    this.options.https[property] = stats ? fs.readFileSync(path.resolve(value)) : value;
                }
            }

            let fakeCert;

            if (!this.options.https.key || !this.options.https.cert) {
                fakeCert = getCertificate();
            }

            this.options.https.key = this.options.https.key || fakeCert;
            this.options.https.cert = this.options.https.cert || fakeCert;
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

        if (this.options.https) {
            this._server = https.createServer(this.options.https, this.app.callback());
        } else {
            this._server = http.createServer(this.app.callback());
        }

        this._server.on('error', err => {
            logger.error(err);
        });
        killable(this._server);
    }
    _createWebSocketServer() {
        if (this._wsServer) {
            return;
        }
        const wss = new WebSocketServer(this);
        this._wsServer = wss;
        wss.init(this._server);
    }
    listen(port = 8899, hostname = '0.0.0.0', fn) {
        this.hostname = hostname;
        this.port = port;

        return this._server.listen(port, hostname, err => {
            this._createWebSocketServer();

            if (typeof fn === 'function') {
                fn.call(this._server, err);
            }
        });
    }
    getUrl(pathname = '/', query = '') {
        return url.format({
            hostname: this.getAddress(),
            protocol: this.options.https ? 'https://' : 'http:',
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
    close() {
        this._wsServer.destory();
        this._server.kill();
    }
}

module.exports = Server;
