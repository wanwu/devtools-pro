/**
 * 兜住错误，重写部分方法
 */
const async = require('async');
const WebSocket = require('ws');
const HTTPMITMProxy = require('http-mitm-proxy');

module.exports = class MITMProxy extends HTTPMITMProxy.Proxy {
    _onWebSocketClose(ctx, closedByServer, code, message) {
        if (code >= 1004 && code <= 1006) {
            code = 1000; // normal closure
            message = `Normally closed. The origin ws is closed at code: ${code} and reason: ${message}`;
        }
        const self = this;
        if (!ctx.closedByServer && !ctx.closedByClient) {
            ctx.closedByServer = closedByServer;
            ctx.closedByClient = !closedByServer;
            async.forEach(
                this.onWebSocketCloseHandlers.concat(ctx.onWebSocketCloseHandlers),
                function(fn, callback) {
                    return fn(ctx, code, message, callback);
                },
                function(err) {
                    if (err) {
                        return self._onWebSocketError(ctx, err);
                    }
                    if (ctx.clientToProxyWebSocket.readyState !== ctx.proxyToServerWebSocket.readyState) {
                        if (
                            ctx.clientToProxyWebSocket.readyState === WebSocket.CLOSED &&
                            ctx.proxyToServerWebSocket.readyState === WebSocket.OPEN
                        ) {
                            ctx.proxyToServerWebSocket.close(code, message);
                        } else if (
                            ctx.proxyToServerWebSocket.readyState === WebSocket.CLOSED &&
                            ctx.clientToProxyWebSocket.readyState === WebSocket.OPEN
                        ) {
                            ctx.clientToProxyWebSocket.close(code, message);
                        }
                    }
                }
            );
        }
    }
    onCertificateMissing(ctx, files, callback) {
        let hosts = files.hosts || [ctx.hostname];
        try {
            this.ca.generateServerCertificateKeys(hosts, function(certPEM, privateKeyPEM) {
                callback(null, {
                    certFileData: certPEM,
                    keyFileData: privateKeyPEM,
                    hosts: hosts
                });
            });
        } catch (e) {
            // 这里出现一些非必要的错误
            this._onError.bind(self, 'CERTIFICATE_MISSING_ERROR', ctx);
        }
        return this;
    }
    _onError(kind, ctx, err) {
        this.onErrorHandlers.forEach(function(handler) {
            return handler(ctx, err, kind);
        });
        if (ctx) {
            ctx.onErrorHandlers.forEach(function(handler) {
                return handler(ctx, err, kind);
            });
            // 最后兜一下
            const res = ctx.proxyToClientResponse;
            if (res && !res.headersSent) {
                res.writeHead(504, 'Proxy Error');
            }
            if (res && !res.finished) {
                res.end('' + kind + ': ' + err, 'utf8');
            }
        }
    }
};
module.exports.wildcard = HTTPMITMProxy.wildcard;
module.exports.gunzip = HTTPMITMProxy.gunzip;
