const assert = require('assert');
const EventEmitter = require('events').EventEmitter;

const MITMProxy = require('http-mitm-proxy');
const Readable = require('stream').Readable;
const decompress = require('./utils/decompress');
const createDebug = require('./utils/createDebug');
const InterceptorFactory = require('./proxy/InterceptorFactory');
const Connection = require('./proxy/Connection');
const findCacheDir = require('./utils/findCacheDir');

const logger = require('./utils/logger');
const {truncate} = require('./utils');

const debug = createDebug('foxy');
const DEFAULT_CHUNK_COLLECT_THRESHOLD = 20 * 1024 * 1024; // about 20 mb

class CommonReadableStream extends Readable {
    constructor(config) {
        super({
            highWaterMark: DEFAULT_CHUNK_COLLECT_THRESHOLD * 5
        });
    }
    _read(size) {}
}

// TODO 统一server ssl认证到node-forge
// TODO 添加下载证书的链接
// TODO 1. 接收事件，建立cdp连接，发送数据
class ProxyServer extends EventEmitter {
    constructor(options = {}) {
        super(logger);
        this.options = options;
        this.port = options.port || 8001;
        this.sslCaDir = options.sslCaDir || findCacheDir();
        this.plugins = options.plugins || [];
        this._connectionMap = new Map();
        // 是否阻塞
        this._blocking = true;
        const proxy = new MITMProxy();
        this.proxy = proxy;
        this._addBuiltInMiddleware();

        const interceptors = {};
        ['request', 'response', 'websocket'].forEach(name => {
            interceptors[name] = new InterceptorFactory();
        });
        this.interceptors = interceptors;
        // TODO 是否加上pathrewirte？
        this.plugins.forEach(plugin => {
            plugin(interceptors);
        });
        // TODO 通过options创建拦截器，有规则的拦截
        this._bindConnectionEvent();
    }
    async _runInterceptor(name, params, conn) {
        const filter = conn.getInterceptorFilter();
        if (this.interceptors[name] && filter) {
            await this.interceptors[name].run(params, filter);
        }
    }
    _addConnection(id, conn) {
        this._connectionMap.set(id, conn);
    }
    _bindConnectionEvent() {
        this.on('_:WebSocketClose', (conn, code, message) => {
            conn.close(code, message);
        }).on('_:WebSocketFrame', (conn, frame) => {
            conn.setWebSocketMessage(frame);
        });
    }
    setBlocking(blocking) {
        this._blocking = !!blocking;
    }
    getBlocking() {
        return this._blocking;
    }
    isBlockable(conn) {
        if (conn && this._blocking === false) {
            return conn.isBlockable();
        }
        return this._blocking === true;
    }
    _onWebSocketConnection(ctx, callback) {
        const conn = new Connection(ctx.clientToProxyWebSocket.upgradeReq, ctx.isSSL, ctx.connectRequest);
        this._addConnection(ctx.id, conn);

        if (!this.isBlockable(conn)) {
            return callback();
        }
        callback();
    }
    // The function that gets called for each WebSocket frame exchanged.
    async _onWebSocketFrame(ctx, type, fromServer, data, flags, callback) {
        const conn = this._connectionMap.get(ctx.id);
        if (!this.isBlockable(conn)) {
            return callback(null, data, flags);
        }

        debug(
            'WEBSOCKET FRAME ' + type + ' received from ' + (fromServer ? 'server' : 'client'),
            ctx.clientToProxyWebSocket.upgradeReq.url,
            ctx.clientToProxyWebSocket.readyState,
            truncate(data)
        );
        const r = {
            type,
            fromServer,
            get body() {
                return data;
            },
            set body(value) {
                data = value;
            }
        };
        if (ctx.clientToProxyWebSocket.readyState === 1) {
            await this._runInterceptor('websocket', r, conn);
            this.emit('_:WebSocketFrame', conn, {
                type,
                fromServer,
                body: data
            });
        }
        return callback(null, data, flags);
    }
    async _onWebSocketError(ctx, error) {
        const conn = this._connectionMap.get(ctx.id);
        if (!this.isBlockable(conn)) {
            return;
        }

        this.emit('error', {
            id: ctx.id,
            conn,
            who: 'websocket',
            error
        });
    }
    _onWebSocketClose(ctx, code, message, callback) {
        const conn = this._connectionMap.get(ctx.id);
        if (!this.isBlockable(conn)) {
            return callback(null, code, message);
        }
        this.emit('_:WebSocketClose', conn, code, message);
        callback(null, code, message);
    }
    async _onRequest(ctx, callback) {
        const req = ctx.clientToProxyRequest;
        const userRes = ctx.proxyToClientResponse;
        const conn = new Connection(req, userRes, ctx.isSSL);
        const id = (ctx.id = conn.getId());
        this._addConnection(id, conn);

        if (!this.isBlockable(conn)) {
            return callback();
        }

        // 压缩中间件
        // ctx.use(MITMProxy.gunzip);
        ctx.use(MITMProxy.wildcard);
        debug('remote request options', ctx.proxyToServerRequestOptions);

        const {request, response} = conn;
        // 拦截器：用于修改发送server的请求参数
        await this._runInterceptor('request', {request, response}, conn);
        // 处理 res.end 提前触发的情况
        if (response.finished) {
            return;
        }
        // 监听request body
        let reqChunks = [];
        ctx.onRequestData((ctx, chunk, callback) => {
            reqChunks.push(chunk);
            return callback(null, chunk);
        });
        ctx.onRequestEnd((ctx, callback) => {
            request.body = Buffer.concat(reqChunks);
            return callback();
        });

        callback();
    }
    // 在发送给clinet response之前调用
    async _onResponseHeaders(ctx, callback) {
        const conn = this._connectionMap.get(ctx.id);
        if (!this.isBlockable(conn)) {
            return callback();
        }

        const originalUrl = ctx.clientToProxyRequest.url;
        const serverRes = ctx.serverToProxyResponse;
        const userRes = ctx.proxyToClientResponse;

        let resChunks = [];
        let resDataStream = null;
        let resSize = 0;
        let isStreamMode = false;
        const self = this;
        async function finished() {
            conn.response.headers = copyHeaders(serverRes.headers);
            conn.response.statusCode = serverRes.statusCode;
            if (isStreamMode) {
                debug('rewrite mode', originalUrl);
                let body = Buffer.concat(resChunks);
                body = await decompress(body, serverRes).catch(err => {
                    // TODO 错误处理
                    logger.error(err);
                });
                if (!body) {
                    debug('response body is empty');
                    return userRes.end('response is empty');
                }

                // rewrite
                conn.response.body = body;

                const {request, response} = conn;

                await self._runInterceptor('response', {request, response}, conn);

                const headers = response.headers;
                const transferEncoding = headers['transfer-encoding'] || headers['Transfer-Encoding'] || '';

                // 处理chunked 情况
                if (transferEncoding !== 'chunked') {
                    headers['content-length'] = Buffer.byteLength(body, 'utf8');
                    delete headers['Content-Length'];
                }

                userRes.writeHead(response.statusCode, headers);
                userRes.end(response.body);
            } else {
                debug('stream mode', originalUrl);
                conn.response.body = resDataStream;
                const {request, response} = conn;

                await self._runInterceptor('response', {request, response}, conn);

                userRes.writeHead(response.statusCode, response.headers);
                response.body.pipe(userRes);
            }
        }
        serverRes.on('data', async chunk => {
            // resChunks.push(chunk);
            if (resDataStream) {
                // stream mode
                resDataStream.push(chunk);
            } else {
                // dataChunks
                resSize += chunk.length;
                resChunks.push(chunk);

                if (!isStreamMode && resSize >= DEFAULT_CHUNK_COLLECT_THRESHOLD) {
                    isStreamMode = true;
                    resDataStream = new CommonReadableStream();
                    while (resChunks.length) {
                        resDataStream.push(resChunks.shift());
                    }
                    resChunks = null;
                    await finished();
                }
            }
        });

        serverRes.on('end', async () => {
            if (resDataStream) {
                resDataStream.push(null); // indicate the stream is end
            } else {
                await finished();
            }
        });
        serverRes.on('error', error => {
            this.emit('error', {
                who: 'serverResponse',
                error,
                conn
            });
        });
        // 继续
        return serverRes.resume();
    }
    async _onError(ctx, err, errorKind) {
        if (ctx) {
            const conn = this._connectionMap.get(ctx.id);
            if (!this.isBlockable(conn)) {
                return;
            }
            const req = ctx.clientToProxyRequest;
            const res = ctx.proxyToClientResponse;
            if (!req && !res) {
                throw err; // "Error: Must provide a proper URL as target"
            }
            const code = err.code;

            if (res.writeHead && !res.headersSent) {
                if (/HPE_INVALID/.test(code)) {
                    res.writeHead(502);
                } else {
                    switch (code) {
                        case 'ECONNRESET':
                        case 'ENOTFOUND':
                        case 'ECONNREFUSED':
                        case 'ETIMEDOUT':
                            res.writeHead(504);
                            break;
                        default:
                            res.writeHead(500);
                    }
                }
            }
            const msg =
                `Error occured while trying to proxy: ${req.url}` + errorKind ? `, error message: ${errorKind}` : '';
            res.end(msg);
        } else {
            // TODO 未知错误处理
        }
    }
    close() {
        this.proxy.close();
        for (const conn of this._connectionMap.values()) {
            conn.destroy();
        }
        this._connectionMap.clear();
        this.removeAllListeners();
    }
    listen(port) {
        this.proxy.listen({port: port || this.port});
    }
    _addBuiltInMiddleware() {
        const lifeCycle = {};
        [
            'Error',
            'CertificateRequired',
            'CertificateMissing',
            'WebSocketConnection',
            'ResponseHeaders',
            'WebSocketSend',
            'WebSocketMessage',
            'WebSocketClose',
            'WebSocketError',
            'WebSocketFrame',

            'Request',
            'RequestHeaders',
            'RequestEnd',
            'Response',
            'RequestData',
            'ResponseData',
            'ResponseEnd'
        ].forEach(event => {
            if (typeof this[`_on${event}`] === 'function') {
                lifeCycle[`on${event}`] = this[`_on${event}`].bind(this);
            }
        });

        this.proxy.use(lifeCycle);
    }
}

function copyHeaders(originalHeaders) {
    const headers = {};

    let keys = Object.keys(originalHeaders);

    // ignore chunked, gzip...
    keys = keys.filter(key => !['content-encoding', 'transfer-encoding'].includes(key.toLowerCase()));

    keys.forEach(key => {
        let value = originalHeaders[key];

        if (key === 'set-cookie') {
            // remove cookie domain
            value = Array.isArray(value) ? value : [value];
            value = value.map(x => x.replace(/Domain=[^;]+?/i, ''));
        } else {
            let canonizedKey = key.trim();
            if (/^public\-key\-pins/i.test(canonizedKey)) {
                // HPKP header => filter
                return;
            }
        }

        headers[key] = value;
    });

    return headers;
}
module.exports = ProxyServer;

const foxy = new ProxyServer();
foxy.interceptors.request.add(a => {
    console.log(11111111, a.body.toString().slice(0, 100));
}, '*/wangyongqing01/*');
foxy.listen(8001);
