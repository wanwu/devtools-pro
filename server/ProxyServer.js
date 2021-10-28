const http = require('http');
const https = require('https');
const zlib = require('zlib');
// const Stream = require('stream');
const Readable = require('stream').Readable;
const HttpProxy = require('http-proxy');
const {nanoid} = require('nanoid');
const CDP = require('chrome-remote-interface');
const matcher = require('./utils/matcher');
const logger = require('./utils/logger');
const pathRewriter = require('./utils/pathRewriter');
const DEFAULT_CHUNK_COLLECT_THRESHOLD = 20 * 1024 * 1024; // about 20 mb
class CommonReadableStream extends Readable {
    constructor(config) {
        super({
            highWaterMark: DEFAULT_CHUNK_COLLECT_THRESHOLD * 5
        });
    }
    _read(size) {}
}

const proxyEventsMap = {
    error: 'onError',
    proxyReq: 'onProxyReq',
    proxyReqWs: 'onProxyReqWs',
    proxyRes: 'onProxyRes',
    open: 'onOpen',
    close: 'onClose'
};

let id = 1;

class ProxyServer extends HttpProxy {
    constructor(options) {
        super(options.httpProxyOptions || {});
        this.httpProxyOptions = options.httpProxyOptions || {};
        this.options = options;
        this._requestInterceptors = [];
        this._responseInterceptors = [];
        // 添加 path rewriter
        this.pathRewriter = pathRewriter(options.pathRewrite);
        // 添加 response interceptor
        let interceptors = options.interceptors;
        if (interceptors) {
            if (!Array.isArray(interceptors)) {
                interceptors = [interceptors];
            }
            interceptors.forEach(interceptor => {
                this.addResponseInterceptor(interceptor);
            });
        }
        this.logger = logger;
    }
    setServerInstance(serverInstance) {
        this.serverInstance = serverInstance;
    }
    listen(port, hostname) {
        let self = this;
        let closure = async function(req, res) {
            await self._requestHandler.bind(self)(req, res);
        };
        for (const [eventName, onEventName] of Object.entries(proxyEventsMap)) {
            this.on(eventName, this[onEventName].bind(this));
        }

        this._server = this.httpProxyOptions.ssl
            ? https.createServer(this.httpProxyOptions.ssl, closure)
            : http.createServer(closure);

        if (this.httpProxyOptions.ws) {
            this._server.on('upgrade', this._upgradeHandler);
        }

        this._server.listen(port, hostname);
        this._server.on('error', this.onError);

        return this;
    }
    addResponseInterceptor(filter, interceptor) {
        if (!interceptor) {
            interceptor = filter;
            filter = undefined;
        }
        if (typeof interceptor === 'function') {
            this._responseInterceptors.push(responseInterceptor(interceptor, filter));
        }
    }
    _prepareResponse(res) {
        res.isHtml = () => {
            if (res._isHtml === undefined) {
                const contentType = res.getHeader('content-type') || '';
                res._isHtml = contentType.indexOf('text/html') === 0;
            }

            return res._isHtml;
        };
    }

    async _applyPathRewrite(req, pathRewriter) {
        if (pathRewriter) {
            const path = await pathRewriter(req.url, req);

            if (typeof path === 'string') {
                req.url = path;
            } else {
                this.logger.info('pathRewrite: No rewritten path found. (%s)', req.url);
            }
        }
    }
    async _prepareRequest(req) {
        req.url = req.originalUrl || req.url;
        let host = req.headers.host;
        req.host = host;
        const uri = new URL(req.url);

        const newProxyOptions = Object.assign(
            {target: uri.protocol + '//' + req.headers.host, selfHandleResponse: true},
            this.httpProxyOptions
        );
        // Apply in order:
        // 1. option.router
        // 2. option.pathRewrite
        await this._applyPathRewrite(req, this.pathRewriter);

        return newProxyOptions;
    }
    async _requestHandler(req, res) {
        req._id = res._id = id++;
        this._prepareResponse(res);
        const activeProxyOptions = await this._prepareRequest(req);
        console.log(activeProxyOptions);
        // todo 增加本地文件代理功能
        this.web(req, res, activeProxyOptions);
    }
    _upgradeHandler(req, socket, head) {
        req._id = socket._id = id++;
        this.on('proxyReqWs', wsInterceptor);
        this.ws(req, socket, head);
    }
    _connect() {
        // 作为一个backend链接
        const sid = nanoid();
        // TODO
        CDP(
            {
                target: `ws://backend/${sid}`
            },
            async c => {
                this.frontendConnection = c;
                const {Network} = c;
                await Network.enable();
            }
        );
    }
    onError(err, req, res) {
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
    onOpen(proxySocket) {
        proxySocket._id = id++;
    }
    onProxyReq(proxyReq, req, res, options) {
        proxyReq._id = req._id = res._id = id++;
    }
    onProxyReqWs(proxyReq, req, socket, options, head) {
        let i = id++;
        if (socket._id) {
            i = socket._id;
        }
        proxyReq._id = req._id = socket._id = i;
    }
    onProxyRes(proxyRes, req, userRes) {
        userRes._id = proxyRes._id;
        // 二进制怎么处理
        // 文本类型直接解压拦截
        const originalProxyRes = proxyRes;

        // this.send('Network.responseReceived');

        // decompress response
        const _proxyRes = decompress(proxyRes, proxyRes.headers['content-encoding']);

        const rawResChunks = [];
        let resDataChunks = [];

        let resDataStream = null;
        let resSize = 0;

        const finished = async () => {
            // 大于20M就不留了，直接开始pipe
            if (resDataStream) {
                resDataStream.pipe(userRes);
            } else {
                const resBody = Buffer.concat(resDataChunks);
                // 复制原始header，主要处理content-length和cookie domain
                copyHeaders(proxyRes, userRes);

                // interceptor
                const uri = req.url;
                let interceptedBuffer = resBody;
                for (let interceptor of this._responseInterceptors) {
                    if (interceptor.filter && !matcher(interceptor.filter, uri, req)) {
                        continue;
                    }
                    // 遍历执行 interceptor
                    interceptedBuffer = Buffer.from(
                        await interceptor(interceptedBuffer, originalProxyRes, req, userRes)
                    );
                }
                console.log(uri, interceptedBuffer);

                // set content-length
                userRes.setHeader('content-length', Buffer.byteLength(interceptedBuffer, 'utf8'));
                userRes.write(interceptedBuffer);
                userRes.end();
            }
        };

        _proxyRes.on('data', chunk => {
            rawResChunks.push(chunk);
            if (resDataStream) {
                // stream模式
                resDataStream.push(chunk);
            } else {
                // chunks
                resSize += chunk.length;
                resDataChunks.push(chunk);

                // 切换到stream模式
                if (resSize >= DEFAULT_CHUNK_COLLECT_THRESHOLD) {
                    resDataStream = new CommonReadableStream();
                    while (resDataChunks.length) {
                        resDataStream.push(resDataChunks.shift());
                    }
                    resDataChunks = null;
                    finished();
                }
            }
        });

        _proxyRes.on('end', async () => {
            if (resDataStream) {
                resDataStream.push(null); // 结束
            } else {
                await finished();
            }
        });

        _proxyRes.on('error', error => {
            console.log(error);
            userRes.end(`Error fetching proxied request: ${error.message}`);
        });
    }
    onClose(res, socket, head) {}
    send(domain, message) {
        if (this.frontendConnection) {
            this.frontendConnection.send(domain, message);
        }
    }
}

function wsInterceptor(interceptor, filter) {
    return async function wsRequest(proxyReq, req, socket, options, head) {
        proxyReq._id = socket._id = req._id;

        const uri = proxyReq.url;
        if (filter && !matcher(filter, uri, req)) {
            return;
        }
        await interceptor(proxyReq, req, socket);
    };
}

function responseInterceptor(interceptor, filter) {
    return async function proxyRes(proxyRes, req, userRes) {
        const uri = req.url;
        proxyRes._id = req._id;
        if (filter && !matcher(filter, uri, req)) {
            return;
        }
    };
}

/**
 * Streaming decompression of proxy response
 * source: https://github.com/apache/superset/blob/9773aba522e957ed9423045ca153219638a85d2f/superset-frontend/webpack.proxy-config.js#L116
 */
function decompress(proxyRes, contentEncoding) {
    let _proxyRes = proxyRes;
    let decompress;

    switch (contentEncoding) {
        case 'gzip':
            decompress = zlib.createGunzip();
            break;
        case 'br':
            decompress = zlib.createBrotliDecompress();
            break;
        case 'deflate':
            decompress = zlib.createInflate();
            break;
        default:
            break;
    }

    if (decompress) {
        _proxyRes.pipe(decompress);
        _proxyRes = decompress;
    }

    return _proxyRes;
}
function copyHeaders(originalResponse, response) {
    response.statusCode = originalResponse.statusCode;
    response.statusMessage = originalResponse.statusMessage;

    if (response.setHeader) {
        let keys = Object.keys(originalResponse.headers);

        // ignore chunked, brotli, gzip, deflate headers
        keys = keys.filter(key => !['content-encoding', 'transfer-encoding'].includes(key));

        keys.forEach(key => {
            let value = originalResponse.headers[key];

            if (key === 'set-cookie') {
                // remove cookie domain
                value = Array.isArray(value) ? value : [value];
                value = value.map(x => x.replace(/Domain=[^;]+?/i, ''));
            }

            response.setHeader(key, value);
        });
    } else {
        response.headers = originalResponse.headers;
    }
}

module.exports = ProxyServer;
if (require.main === module) {
    const p = new ProxyServer({options: {}});
    p.listen(8001);
}
