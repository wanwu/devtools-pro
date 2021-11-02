/**
 * 每个请求的connection对象
 */
const url = require('url');
const isTextOrBinary = require('istextorbinary');
const InterceptorFactory = require('./InterceptorFactory');
const getResourceType = require('../utils/getResourceType');

let id = 1;
const genId = () => id++;

module.exports = class Connection {
    constructor(req, isSSL = false, websocketConnect) {
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
        this._pathname = req.url; // pathname
        this._url = getFullUrl(this._protocol, req);
        this._host = req.headers.host;
        this._timing = {
            start: Date.now()
        };
        this._request = {
            req: req,
            type: this._type,
            method: this._method,
            headers: [],
            body: null
        };

        this._respones = {
            res: null,
            body: null,
            statusCode: null,
            headers: [],
            isBinary: false,
            isBigStream: false,
            resourceType: null
        };
    }
    isBlockable() {
        return this._blocking === true;
    }
    setBlocking(blocking) {
        this._blocking = !!blocking;
    }
    getType() {
        return this._type;
    }
    isWebSocket() {
        return this._type === 'ws';
    }
    getMethod() {
        return this._method;
    }
    setResponse(res) {
        this._respones.res = res;
    }
    setResponseHeaders(headers, statusCode) {
        this._respones.resourceType = getResourceType(headers['content-type']);
        this._respones.headers = headers;
        this._respones.statusCode = statusCode;
    }
    setResponseBody(body, isBigStream = false) {
        body = Buffer.isBuffer(body) ? body : Buffer.from(body);

        const resourceType = this._respones.resourceType;
        let isBinary = false;
        if (['Image', 'Media', 'Font'].includes(resourceType)) {
            isBinary = true;
        } else if (resourceType === 'Other') {
            isBinary = isTextOrBinary.isBinary(null, body);
        }
        this._respones.isBinary = isBinary;
        this._respones.body = isBinary ? body.toString('base64') : body.toString('utf8');
        this._respones.isBigStream = isBigStream;
    }
    setRequestHeaders(headers) {
        this._request.headers = headers;
    }
    setRequestBody(body) {
        this._request.body = body;
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
            url: this._url,
            pathname: this._pathname,
            method: this._method,
            host: this._host,
            headers: this._request.headers,
            sourceType: this._respones.resourceType,
            statusCode: this._respones.statusCode,
            userAgent: this._request.headers['user-agent'] || this._request.headers['User-Agent']
        };
        const interceptorFilter = InterceptorFactory.createFilter(context);
        return interceptorFilter;
    }
    destroy() {
        this._request = null;
        this._respones = null;
        this._timing = null;
    }
    getTiming() {
        return this._timing;
    }
    close(code, msg) {
        this._close = code;
        this._closeMsg = msg;
    }
};

function getFullUrl(protocol, req) {
    let parsedUrl = url.parse(req.url);
    parsedUrl.protocol = protocol;
    parsedUrl.host = req.headers.host;

    return url.format(parsedUrl);
}
