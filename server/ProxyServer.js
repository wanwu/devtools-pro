const EventEmitter = require('events').EventEmitter;
const MITMProxy = require('http-mitm-proxy');
const Readable = require('stream').Readable;
const decompress = require('./utils/decompress');
const createDebug = require('./utils/createDebug');
const InterceptorFactory = require('./proxy/InterceptorFactory');
const Connection = require('./proxy/Connection');

const logger = require('./utils/logger');
const {truncate} = require('./utils');
const {
    WEBSOCKET_FRAME,
    BEFORE_CREATE_REQUEST,
    BEFORE_SEND_REQUEST,
    BEFORE_SEND_REQUEST_HEADERS,
    ERROR_OCCURRED,
    BEFORE_SEND_RESPONSE_HEADERS,
    BEFORE_SEND_RESPONSE_BODY
} = require('./constants').PROXY_INTERCEPTORS;
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
// TODO 把sslCaDir改到一个公共位置去，home temp dir
// TODO 添加下载证书的链接
// TODO 1. 接收事件，建立cdp连接，发送数据
class ProxyServer extends EventEmitter {
    constructor(options) {
        super(logger);
        this.options = options;
        this._connectionMap = new Map();
        // 是否阻塞
        this._blocking = true;
        const proxy = new MITMProxy();
        this.proxy = proxy;
        this._addBuiltInMiddleware();

        const interceptors = {};
        [
            WEBSOCKET_FRAME,
            BEFORE_CREATE_REQUEST,
            BEFORE_SEND_REQUEST,
            BEFORE_SEND_REQUEST_HEADERS,
            ERROR_OCCURRED,
            BEFORE_SEND_RESPONSE_HEADERS,
            BEFORE_SEND_RESPONSE_BODY
        ].forEach(name => {
            interceptors[name] = new InterceptorFactory();
        });
        this.interceptors = interceptors;
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
        this.on('_:requestHeaders', (conn, headers) => {
            conn.setRequestHeaders(headers);
        })
            .on('_:requestBody', (conn, body) => {
                conn.setRequestBody(body);
            })
            .on('_:serverRes', (conn, res) => {
                conn.setResponse(res);
            })
            .on('_:responseHeaders', (conn, headers) => {
                conn.setResponseHeaders(headers);
            })
            .on('_:responseBody', (conn, body, isBigStream) => {
                conn.setResponseBody(body, isBigStream);
            })
            .on('_:WebSocketClose', (conn, code, message) => {
                conn.close(code, message);
            })
            .on('_:WebSocketFrame', (conn, frame) => {
                conn.setWebSocketMessage(frame);
            });
    }
    setBlocking(blocking) {
        this._blocking = !!blocking;
    }
    getBlocking() {
        return this._blocking;
    }
    isBlockable() {
        return this._blocking === true;
    }
    _onWebSocketConnection(ctx, callback) {
        const conn = new Connection(ctx.clientToProxyWebSocket.upgradeReq, ctx.isSSL, ctx.connectRequest);
        this._addConnection(ctx.id, conn);

        if (!this.isBlockable()) {
            return callback();
        }
        callback();
    }
    // The function that gets called for each WebSocket frame exchanged.
    async _onWebSocketFrame(ctx, type, fromServer, data, flags, callback) {
        if (!this.isBlockable()) {
            return callback(null, data, flags);
        }
        const conn = this._connectionMap.get(ctx.id);

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
            await this._runInterceptor(WEBSOCKET_FRAME, r, conn);
            this.emit('_:WebSocketFrame', conn, {
                type,
                fromServer,
                body: data
            });
        }
        return callback(null, data, flags);
    }
    async _onWebSocketError(ctx, error) {
        if (!this.isBlockable()) {
            return;
        }
        const conn = this._connectionMap.get(ctx.id);

        await this._runInterceptor(ERROR_OCCURRED, error, conn);
        this.emit('error', {
            id: ctx.id,
            conn,
            who: 'websocket',
            error
        });
    }
    _onWebSocketClose(ctx, code, message, callback) {
        if (!this.isBlockable()) {
            return callback(null, code, message);
        }
        const conn = this._connectionMap.get(ctx.id);
        this.emit('_:WebSocketClose', conn, code, message);
        callback(null, code, message);
    }

    async _onRequest(ctx, callback) {
        const req = ctx.clientToProxyRequest;
        const conn = new Connection(req, ctx.isSSL);
        const id = (ctx.id = conn.getId());
        this._addConnection(id, conn);

        if (!this.isBlockable()) {
            return callback();
        }

        // 压缩中间件
        // ctx.use(MITMProxy.gunzip);
        ctx.use(MITMProxy.wildcard);

        // 拦截器：用于修改发送server的请求参数
        await this._runInterceptor(BEFORE_CREATE_REQUEST, ctx.proxyToServerRequestOptions, conn);
        let isCanceled = false;
        // 拦截器：用于修改发送server的请求，暂时没用到
        await this._runInterceptor(BEFORE_SEND_REQUEST, {req, request: req}, conn);
        if (isCanceled) {
            return;
        }
        // 监听request body
        let reqChunks = [];
        ctx.onRequestData((ctx, chunk, callback) => {
            reqChunks.push(chunk);
            // this.emit('_:requestData', conn, chunk);
            return callback(null, chunk);
        });
        ctx.onRequestEnd((ctx, callback) => {
            this.emit('_:requestBody', conn, Buffer.concat(reqChunks));
            return callback();
        });

        callback();
    }
    async _onRequestHeaders(ctx, callback) {
        if (!this.isBlockable()) {
            return callback();
        }
        const conn = this._connectionMap.get(ctx.id);

        const headers = ctx.proxyToServerRequestOptions.headers;
        // 拦截器：用于修改发送server的请求参数
        await this._runInterceptor(BEFORE_SEND_REQUEST_HEADERS, headers, conn);
        ctx.proxyToServerRequestOptions.headers = headers;
        this.emit('_:requestHeaders', conn, headers);
        callback();
    }

    // async _onResponse(ctx, callback) {
    //     if (!this.isBlockable()) {
    //         return callback();
    //     }
    //     // conn.setResponse(ctx.proxyToClientResponse);
    //     callback();
    // }
    // 在发送给clinet response之前调用
    async _onResponseHeaders(ctx, callback) {
        if (!this.isBlockable()) {
            return callback();
        }
        const conn = this._connectionMap.get(ctx.id);

        const originalUrl = ctx.clientToProxyRequest.url;
        const serverRes = ctx.serverToProxyResponse;
        const userRes = ctx.proxyToClientResponse;
        this.emit('_:response', conn, serverRes);

        let resChunks = [];
        let resDataStream = null;
        let resSize = 0;
        let blocking = true;
        const self = this;
        async function finished() {
            if (blocking) {
                let body = Buffer.concat(resChunks);
                body = await decompress(body, serverRes).catch(err => {
                    logger.error(err);
                });
                if (!body) {
                    debug('response body is empty');
                    return userRes.end('response is empty');
                }

                const sendToClientHeaders = headersFilter(serverRes.headers);

                // rewrite
                debug('rewrite mode', originalUrl);
                await self._runInterceptor(BEFORE_SEND_RESPONSE_HEADERS, sendToClientHeaders, conn);
                const transferEncoding =
                    sendToClientHeaders['transfer-encoding'] || sendToClientHeaders['Transfer-Encoding'] || '';

                // 处理chunked 情况
                if (transferEncoding !== 'chunked') {
                    sendToClientHeaders['content-length'] = Buffer.byteLength(body, 'utf8');
                    delete sendToClientHeaders['Content-Length'];
                }

                userRes.writeHead(serverRes.statusCode, sendToClientHeaders);
                self.emit('_:responseHeaders', conn, sendToClientHeaders, serverRes.statusCode);

                const rs = {
                    get responseBody() {
                        return body;
                    },
                    set responseBody(value) {
                        typeof value === 'string' && (value = Buffer.from(value));
                        body = value;
                    }
                };

                await self._runInterceptor(BEFORE_SEND_RESPONSE_BODY, rs, conn);
                self.emit('_:responseBody', conn, body);
                userRes.end(body);
            } else {
                debug('stream mode', originalUrl);

                await self._runInterceptor(BEFORE_SEND_RESPONSE_HEADERS, serverRes.headers, conn);

                self.emit('_:responseHeaders', conn, serverRes.headers);
                userRes.writeHead(serverRes.statusCode, serverRes.headers, serverRes.statusCode);

                self.emit('_:responseBody', conn, resDataStream, true);
                resDataStream.pipe(userRes);
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

                if (blocking && resSize >= DEFAULT_CHUNK_COLLECT_THRESHOLD) {
                    blocking = false;
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
        if (!this.isBlockable()) {
            return;
        }
        if (ctx) {
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
            const conn = this._connectionMap.get(ctx.id);
            await this._runInterceptor(ERROR_OCCURRED, {err, errorKind}, conn);
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
        this.proxy.listen({port});
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

function headersFilter(originalHeaders) {
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
foxy.interceptors[BEFORE_SEND_RESPONSE_BODY].add(a => {
    console.log(11111111, a.responseBody.toString());
}, '/wangyongqing01/*');
foxy.listen(8001);
