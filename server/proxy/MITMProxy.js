/**
 * 兜住错误，重写部分方法
 */
const HTTPMITMProxy = require('http-mitm-proxy');

module.exports = class MITMProxy extends HTTPMITMProxy {
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
