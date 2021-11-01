const EventEmitter = require('events').EventEmitter;
const MITMProxy = require('http-mitm-proxy');
const Readable = require('stream').Readable;
const decompress = require('./utils/decompress');
const createDebug = require('./utils/createDebug');
const InterceptorFactory = require('./foxy/InterceptorFactory');
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
let id = 1;

// TODO 统一server ssl认证到node-forge
// TODO 把sslCaDir改到一个公共位置去，home temp dir
// TODO 添加下载证书的链接
class ProxyServer extends EventEmitter {
    constructor(options) {
        super(logger);
        this.options = options;
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
    }
    async _runInterceptor(name, params, filter) {
        if (this.interceptors[name]) {
            await this.interceptors[name].run(params, filter);
        }
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
        if (!this.isBlockable()) {
            return callback();
        }
        normalizeContext(ctx);
        this.emit('WebSocketConnect', {id: ctx.id, ctx});
        callback();
    }
    // The function that gets called for each WebSocket frame exchanged.
    async _onWebSocketFrame(ctx, type, fromServer, data, flags, callback) {
        if (!this.isBlockable()) {
            return callback(null, data, flags);
        }
        // TODO 这里blocking应该根据matcher判断
        debug(
            'WEBSOCKET FRAME ' + type + ' received from ' + (fromServer ? 'server' : 'client'),
            ctx.clientToProxyWebSocket.upgradeReq.url,
            ctx.clientToProxyWebSocket.readyState,
            truncate(data)
        );
        const r = {
            ctx,
            id: ctx.id,
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
            await this._runInterceptor(WEBSOCKET_FRAME, r, ctx.interceptorFilter);
            this.emit('WebSocketFrame', r);
        }
        return callback(null, data, flags);
    }
    _onWebSocketError(ctx, error) {
        if (!this.isBlockable()) {
            return;
        }
        this.emit('error', {
            id: ctx.id,
            ctx,
            who: 'websocket',
            error
        });
    }
    _onWebSocketClose(ctx, code, message, callback) {
        if (!this.isBlockable()) {
            return callback(null, code, message);
        }
        this.emit('WebSocketClose', {id: ctx.id, code, message});
        callback(null, code, message);
    }
    async _onResponse(ctx, callback) {
        if (!this.isBlockable()) {
            return callback();
        }
        this.emit('responseStart', {id: ctx.id, ctx});
        callback();
    }
    // 在发送给clinet response之前调用
    async _onResponseHeaders(ctx, callback) {
        if (!this.isBlockable()) {
            return callback();
        }
        const originalUrl = ctx.clientToProxyRequest.url;
        const serverRes = ctx.serverToProxyResponse;
        const userRes = ctx.proxyToClientResponse;

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
                await self._runInterceptor(BEFORE_SEND_RESPONSE_HEADERS, sendToClientHeaders, ctx.interceptorFilter);
                const transferEncoding =
                    sendToClientHeaders['transfer-encoding'] || sendToClientHeaders['Transfer-Encoding'] || '';

                // 处理chunked 情况
                if (transferEncoding !== 'chunked') {
                    sendToClientHeaders['content-length'] = Buffer.byteLength(body, 'utf8');
                    delete sendToClientHeaders['Content-Length'];
                }

                userRes.writeHead(serverRes.statusCode, sendToClientHeaders);
                self.emit('responseHeaders', sendToClientHeaders);

                const rs = {
                    get responseBody() {
                        return body;
                    },
                    set responseBody(value) {
                        typeof value === 'string' && (value = Buffer.from(value));
                        body = value;
                    }
                };

                await self._runInterceptor(BEFORE_SEND_RESPONSE_BODY, rs, ctx.interceptorFilter);
                self.emit('responseReceived', body);
                userRes.end(body);
            } else {
                debug('stream mode', originalUrl);
                self.emit('responseHeaders', serverRes.headers);

                await self._runInterceptor(BEFORE_SEND_RESPONSE_HEADERS, serverRes.headers, ctx.interceptorFilter);

                self.emit('responseReceived', resDataStream);

                userRes.writeHead(serverRes.statusCode, serverRes.headers);
                resDataStream.pipe(userRes);
            }
        }
        serverRes.on('data', async chunk => {
            this.emit('responseData', {id: ctx.id, chunk});
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
            this.emit('responseEnd', {id: ctx.id});
            if (resDataStream) {
                resDataStream.push(null); // indicate the stream is end
            } else {
                await finished();
            }
        });
        serverRes.on('error', error => {
            this.emit('error', {
                who: 'serverResponse',
                error
            });
        });
        // 继续
        return serverRes.resume();
    }

    async _onRequest(ctx, callback) {
        normalizeContext(ctx);
        if (!this.isBlockable()) {
            return callback();
        }
        const req = ctx.clientToProxyRequest;

        // 压缩中间件
        // ctx.use(MITMProxy.gunzip);
        ctx.use(MITMProxy.wildcard);

        // 用于修改发送server的请求参数
        await this._runInterceptor(BEFORE_CREATE_REQUEST, ctx.proxyToServerRequestOptions, ctx.interceptorFilter);
        let isCanceled = false;
        const res = ctx.proxyToClientResponse;
        const fakeRes = {
            set statusCode(code) {
                res.statusCode = code;
            },
            set statusMessage(message) {
                res.statusMessage = message;
            },
            // eslint-disable-next-line
            end: function(chunk, encoding, callback) {
                isCanceled = true;
                res.end(chunk, encoding, callback);
                return this;
            },
            // eslint-disable-next-line
            setHeader: function(name, value) {
                res.setHeader(name, value);
                return this;
            },
            // eslint-disable-next-line
            removeHeader: function(name) {
                res.removeHeader(name);
                return this;
            }
        };
        await this._runInterceptor(BEFORE_SEND_REQUEST, {req, res: fakeRes}, ctx.interceptorFilter);
        if (isCanceled) {
            return;
        }
        // 监听request body
        let reqChunks = [];
        ctx.onRequestData((ctx, chunk, callback) => {
            reqChunks.push(chunk);
            this.emit('requestData', {id: ctx.id, chunk});

            return callback(null, chunk);
        });
        ctx.onRequestEnd((ctx, callback) => {
            this.emit('requestEnd', {id: ctx.id});
            return callback();
        });

        callback();
    }
    async _onRequestHeaders(ctx, callback) {
        if (!this.isBlockable()) {
            return callback();
        }
        const headers = ctx.proxyToServerRequestOptions.headers;
        await this._runInterceptor(BEFORE_SEND_REQUEST_HEADERS, headers, ctx.interceptorFilter);
        ctx.proxyToServerRequestOptions.headers = headers;
        this.emit('requestHeaders', headers);
        callback();
    }
    _onError(ctx, err, errorKind) {
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
        } else {
            // TODO 未知错误处理
        }
    }
    close() {
        this.proxy.close();
        this._connectionMap.clear();
        this.clearHooks();
    }
    listen(port, hostname) {
        this.proxy.listen({port});
        logger.info('Foxy is ready to go!');
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

    // ignore chunked, brotli, gzip, deflate headers
    keys = keys.filter(key => !['content-encoding', 'transfer-encoding'].includes(key));

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

function normalizeContext(ctx) {
    if (!ctx.id) {
        ctx.id = id++;
        const interceptorFilter = InterceptorFactory.createFilter(ctx.clientToProxyRequest);
        ctx.interceptorFilter = interceptorFilter;
    }
}

// const foxy = new ProxyServer();
// foxy.interceptors[BEFORE_SEND_RESPONSE_BODY].add(a => {
//     console.log(11111111, a.responseBody.toString());
// }, '/wangyongqing01/*');
// foxy.listen(8001);
