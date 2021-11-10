/**
 * 兜住错误，重写部分方法
 */
const HTTPMITMProxy = require('http-mitm-proxy');
const logger = require('../utils/logger');

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
            logger.error(e);
        }
        return this;
    }
    _onErrorF(kind, ctx, err) {
        this.onErrorHandlers.forEach(function(handler) {
            return handler(ctx, err, kind);
        });
        if (ctx) {
            ctx.onErrorHandlers.forEach(function(handler) {
                return handler(ctx, err, kind);
            });

            if (ctx.proxyToClientResponse && !ctx.proxyToClientResponse.headersSent) {
                ctx.proxyToClientResponse.writeHead(504, 'Proxy Error');
            }
            if (ctx.proxyToClientResponse && !ctx.proxyToClientResponse.finished) {
                ctx.proxyToClientResponse.end('' + kind + ': ' + err, 'utf8');
            }
        }
    }
};
