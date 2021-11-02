/**
 * 每个请求的connection对象
 */
const url = require('url');
const assert = require('assert');
const Stream = require('stream');

const parse = require('parseurl');
const statuses = require('statuses');
const getType = require('cache-content-type');
const onFinish = require('on-finished');
const destroy = require('destroy');
const InterceptorFactory = require('./InterceptorFactory');
const getResourceType = require('../utils/getResourceType');

const stringify = url.format;
let id = 1;
const genId = () => id++;

module.exports = class Connection {
    constructor(req, res, isSSL = false, websocketConnect) {
        this._isSSL = isSSL;

        this._id = genId();
        this._blocking = true;
        this._protocol = isSSL ? 'https' : 'http';
        if (websocketConnect) {
            this._type = 'ws';
            this._method = 'CONNECT';
            this._protocol = isSSL ? 'wss' : 'ws';
        } else {
            this._method = req.method;
            this._type = 'http';
        }
        const request = createRequest(req);
        this.request = request;
        this.request.fullUrl = getFullUrl(this._protocol, req);

        this.timing = {
            start: Date.now()
        };

        this.respones = this.respones = createResponse(res, req);
        this.websocketMessages = [];
    }
    isBlockable() {
        return this._blocking === true;
    }
    setBlocking(blocking) {
        this._blocking = !!blocking;
    }

    isWebSocket() {
        return this._type === 'ws';
    }
    setWebSocketMessage(frame) {
        // type = ping/pong/message
        const {type, fromServer, body} = frame;
    }
    getId() {
        return this._id;
    }
    getInterceptorFilter() {
        // 创建filter context
        const context = {
            // type: this._type,
            // protocol: this._protocol,
            url: this.request.url,
            fullUrl: this.request.fullUrl,
            path: this.request.path,
            method: this.request.method,
            host: this.request.host,
            headers: this.request.headers,
            reSourceType: this.respones.resourceType,
            statusCode: this.respones.statusCode,
            userAgent: this.request.headers['user-agent'] || this.request.headers['User-Agent']
        };
        const interceptorFilter = InterceptorFactory.createFilter(context);
        return interceptorFilter;
    }
    destroy() {
        this.request = null;
        this.respones = null;
        this.timing = null;
        this._websocketMessages.length = 0;
    }
    getTiming() {
        return this.timing;
    }
    close(code, msg) {
        this._close = code;
        this._closeMsg = msg;
        this.destroy();
    }
};

function getFullUrl(protocol, req) {
    let parsedUrl = url.parse(req.url);
    parsedUrl.protocol = protocol;
    parsedUrl.host = req.headers.host;

    return url.format(parsedUrl);
}
function createResponse(userRes, req) {
    const cloneRes = Object.create(null);
    cloneRes.headers = {};

    return Object.create({
        // =========readonly==========
        get res() {
            return userRes;
        },
        get headerSent() {
            return userRes.headerSent;
        },
        get finished() {
            if ('writableEnded' in userRes) {
                return userRes.writableEnded;
            }
            return userRes.finished;
        },
        // =========methods==========
        setHeader(name, value) {
            if (!name || !value) {
                return;
            }

            cloneRes.headers[name] = value;
        },
        removeHeader(name) {
            cloneRes.headers[name] = null;
            delete cloneRes.headers[name];
        },
        getHeader(name) {
            return cloneRes.headers[name];
        },
        write(chunk) {
            userRes.write(chunk);
        },
        end(str) {
            userRes.end(str);
        },
        // =========write==========
        get body() {
            return cloneRes._body;
        },
        set body(val) {
            const original = cloneRes._body;
            cloneRes._body = val;

            // no content
            if (null == val) {
                if (!statuses.empty[this.statusCode]) {
                    this.statusCode = 204;
                }
                if (val === null) {
                    this._explicitNullBody = true;
                }
                this.removeHeader('Content-Type');
                this.removeHeader('Content-Length');
                this.removeHeader('Transfer-Encoding');
                return;
            }

            // set the status
            if (!this._explicitStatus) {
                this.statusCode = 200;
            }

            // set the content-type only if not yet set
            const setType = !this.getHeader('Content-Type');

            // string
            if ('string' === typeof val) {
                if (setType) {
                    this.type = /^\s*</.test(val) ? 'html' : 'text';
                }
                this.length = Buffer.byteLength(val);
                return;
            }

            // buffer
            if (Buffer.isBuffer(val)) {
                if (setType) {
                    this.type = 'bin';
                }
                this.length = val.length;
                return;
            }

            // stream
            if (val instanceof Stream) {
                onFinish(userRes, destroy.bind(null, val));
                if (original != val) {
                    // overwriting
                    if (null != original) {
                        this.removeHeader('Content-Length');
                    }
                }

                if (setType) {
                    this.type = 'bin';
                }
                return;
            }
        },
        get statusCode() {
            return cloneRes.statusCode;
        },
        set statusCode(code) {
            if (userRes.headerSent) {
                return;
            }

            assert(Number.isInteger(code), 'status code must be a number');
            assert(code >= 100 && code <= 999, `invalid status code: ${code}`);
            this._explicitStatus = true;
            cloneRes.statusCode = code;
            if (req.httpVersionMajor < 2) {
                cloneRes.statusMessage = statuses[code];
            }
            if (this.body && statuses.empty[code]) {
                this.body = null;
            }
        },
        get headers() {
            return cloneRes.headers;
        },
        set headers(val) {
            cloneRes.headers = val;
        },
        set length(n) {
            this.setHeader('Content-Length', n);
        },
        get length() {
            const length = this.getHeader('Content-Length');
            if (length) {
                return parseInt(length, 10) || 0;
            }

            const body = this.body;
            if (!body || body instanceof Stream) {
                return undefined;
            }
            if ('string' === typeof body) {
                return Buffer.byteLength(body);
            }
            if (Buffer.isBuffer(body)) {
                return body.length;
            }
            return Buffer.byteLength(JSON.stringify(body));
        },
        get type() {
            const type = this.getHeader('Content-Type');
            if (!type) {
                return '';
            }
            return type.split(';', 1)[0];
        },
        set type(type) {
            type = getType(type);
            if (type) {
                this.resourceType = getResourceType(type);
                this.set('Content-Type', type);
            } else {
                this.remove('Content-Type');
            }
        }
    });
}
function createRequest(req) {
    const clonedReq = Object.create(null);

    ['headers', 'url', 'method'].forEach(k => {
        clonedReq[k] = req[k];
    });
    clonedReq.host = clonedReq.headers.host;

    return Object.create({
        // ========readonly========
        get req() {
            return req;
        },
        get originalUrl() {
            return req.url;
        },
        // ========writeable=====
        get host() {
            return clonedReq.host;
        },
        set host(value) {
            clonedReq.host = value;
        },
        get headers() {
            return clonedReq.headers;
        },
        set headers(val) {
            clonedReq.headers = val;
        },
        get method() {
            return clonedReq.method;
        },
        set method(val) {
            clonedReq.method = val;
        },
        get url() {
            return clonedReq.url;
        },
        set url(val) {
            clonedReq.url = val;
        },
        get body() {
            return clonedReq.body;
        },
        set body(val) {
            clonedReq.body = val;
        },
        get path() {
            return parse(clonedReq).path;
        },
        set path(path) {
            const url = parse(clonedReq);
            if (url.path === path) {
                return;
            }

            url.path = path;
            this.url = stringify(url);
        },
        get pathname() {
            return parse(clonedReq).pathname;
        },
        set pathname(pathname) {
            const url = parse(clonedReq);
            if (url.pathname === pathname) {
                return;
            }

            url.pathname = pathname;

            this.url = stringify(url);
        },
        setHeader(key, value) {
            if (!value || !key) {
                return;
            }
            clonedReq.headers[key] = value;
        },
        getHeader(key) {
            return clonedReq.headers[key];
        }
    });
}
