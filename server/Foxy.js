// const EventEmitter = require('events').EventEmitter;
const Hookable = require('hable');
const MITMProxy = require('http-mitm-proxy');
const Readable = require('stream').Readable;
const {nanoid} = require('nanoid');
const CDP = require('chrome-remote-interface');
const decompress = require('./utils/decompress');
const createDebug = require('./utils/createDebug');
const logger = require('./utils/logger');
const {truncate} = require('./utils');
const Connection = require('./proxy/Connection');
const {
    BEFORE_CREATE_REQUEST,
    BEFORE_SEND_REQUEST,
    BEFORE_SEND_REQUEST_HEADERS,
    ERROR_OCCURRED,
    BEFORE_SEND_RESPONSE_HEADERS,
    BEFORE_SEND_RESPONSE_BODY
} = require('./constants').FOXY_PUBLIC_HOOKS;
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
class Foxy extends Hookable {
    constructor(options) {
        super(logger);
        this.options = options;
        this._blocking = true;
        this._connectionMap = new Map();
        const proxy = new MITMProxy();
        this.proxy = proxy;
        this._addBuiltInMiddleware();
        this._addBuiltInHooks();
    }
    _addBuiltInHooks() {
        this.addHooks({
            async responseInterceptor(rs) {
                // console.log('responseInterceptor');
                // rs.responseBody = '1212121';
            }
            // async requestInterceptor(req, res) {
            //     console.log(res);
            //     res.end('12121');
            // }
        });
    }
    use(proxyMiddleware) {
        this.proxy.use(proxyMiddleware);
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
    connectToCDP() {
        // this.hook('cdp:')
        // this._bridge = CDP();
    }
    _onWebSocketConnection(ctx, callback) {
        const connection = new Connection(ctx);
        this._connectionMap.set(connection.id, connection);
        // TODO 发送 cdp Network.webSocketCreated 事件
        this.callHook('cdp:Network.webSocketRequest', connection);
        callback();
    }
    // The function that gets called for each WebSocket frame exchanged.
    async _onWebSocketFrame(ctx, type, fromServer, data, flags, callback) {
        // TODO 这里blocking应该根据matcher判断

        debug(
            'WEBSOCKET FRAME ' + type + ' received from ' + (fromServer ? 'server' : 'client'),
            ctx.clientToProxyWebSocket.upgradeReq.url,
            truncate(data)
        );
        const r = {
            ctx,
            type,
            fromServer,
            get body() {
                return data;
            },
            set body(value) {
                data = value;
            }
        };
        await this.callHook('websocketFrame', r);

        return callback(null, data, flags);
    }
    _onWebSocketError(ctx, error) {
        this._closeConnection(ctx);
    }
    _onWebSocketClose(ctx, code, message, callback) {
        callback(null, code, message);
        this._closeConnection(ctx);
    }
    async _onResponse(ctx, callback) {
        await this.callHook('responseStart', ctx.serverToProxyResponse);
        callback();
    }
    // 在发送给clinet response之前调用
    async _onResponseHeaders(ctx, callback) {
        const originalUrl = ctx.clientToProxyRequest.url;
        const serverRes = ctx.serverToProxyResponse;
        // await this.callHook('beforSendResponse', serverRes);
        const userRes = ctx.proxyToClientResponse;

        let resChunks = [];
        let resDataStream = null;
        let resSize = 0;
        // TODO 这里blocking应该根据matcher判断
        let blocking = true;
        const self = this;
        async function finished() {
            if (blocking) {
                let body = Buffer.concat(resChunks);
                body = await decompress(body, serverRes).catch(err => {
                    logger.error(err);
                });
                if (!body) {
                    // TODO 错误处理
                    debug('response body is empty');
                    return userRes.end('response is empty');
                }

                const sendToClientHeaders = headersFilter(serverRes.headers);
                sendToClientHeaders['content-length'] = Buffer.byteLength(body, 'utf8');
                delete sendToClientHeaders['Content-Length'];
                // rewrite
                debug('rewrite mode', originalUrl);
                await self.callHook(BEFORE_SEND_RESPONSE_HEADERS, sendToClientHeaders);
                userRes.writeHead(serverRes.statusCode, sendToClientHeaders);

                const rs = {
                    get responseBody() {
                        return body;
                    },
                    set responseBody(value) {
                        typeof value === 'string' && (value = Buffer.from(value));
                        body = value;
                    }
                };
                await self.callHook(BEFORE_SEND_RESPONSE_BODY, rs);

                userRes.end(body);
            } else {
                debug('stream mode', originalUrl);
                await self.callHook('beforeSendResponseHeaders', serverRes.headers);
                userRes.writeHead(serverRes.statusCode, serverRes.headers);
                resDataStream.pipe(userRes);
            }
            // TODO 发送 cdp Network.loadingFinished 事件
            self.callHook('cdp:Network.loadingFinished', ctx);
            self._closeConnection();
        }
        serverRes.on('data', async chunk => {
            // await self.callHook('responseData', chunk);
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
            // await self.callHook('responseEnd');
            if (resDataStream) {
                resDataStream.push(null); // indicate the stream is end
            } else {
                await finished();
            }
        });
        serverRes.on('error', error => {
            this.callHook(ERROR_OCCURRED, {
                who: 'serverResponse',
                error
            });
        });
        // 继续
        return serverRes.resume();
    }
    _closeConnection(ctx) {
        if (ctx && ctx._id) {
            const connection = this._connectionMap.get(ctx._id);
            connection.close();
            this._connectionMap.delete(ctx._id);
        }
    }
    async _onRequest(ctx, callback) {
        // 压缩中间件
        // ctx.use(MITMProxy.gunzip);
        ctx.use(MITMProxy.wildcard);
        const connection = new Connection(ctx);
        const id = connection.getId();
        this._connectionMap.set(id, connection);
        ctx._id = id;
        // 用于修改发送server的请求参数
        await this.callHook(BEFORE_CREATE_REQUEST, ctx.proxyToServerRequestOptions);
        const req = ctx.clientToProxyRequest;
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
        await this.callHook(BEFORE_SEND_REQUEST, {req, res: fakeRes});
        if (isCanceled) {
            return;
        }
        // 监听request body
        let reqChunks = [];
        ctx.onRequestData((ctx, chunk, callback) => {
            // this.callHook('reqeustData', chunk)
            reqChunks.push(chunk);
            return callback(null, chunk);
        });
        ctx.onRequestEnd((ctx, callback) => {
            // this.callHook('afterRequest', {
            //     req,
            //     isSSL: ctx.isSSL,
            //     reqBody: Buffer.concat(reqChunks).toString()
            // });
            return callback();
        });

        callback();
    }
    async _onRequestHeaders(ctx, callback) {
        const headers = ctx.proxyToServerRequestOptions.headers;
        await this.callHook(BEFORE_SEND_REQUEST_HEADERS, headers);
        ctx.proxyToServerRequestOptions.headers = headers;
        callback();
    }
    _onError(ctx, err, errorKind) {
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

            res.end(`Error occured while trying to proxy: ${req.url}`);
        }

        this._closeConnection();
        this.callHook(ERROR_OCCURRED, {
            who: 'unkown',
            error: err,
            errorKind
        });
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
            'Connect',
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

const foxy = new Foxy();
foxy.listen(8001);
