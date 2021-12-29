/**
 * 兜住错误，重写部分方法
 */
const HTTPMITMProxy = require('@wanwu/mitm-proxy');

module.exports = class MITMProxy extends HTTPMITMProxy.Proxy {
    _onError(kind, ctx, err) {
        // kind == 'CERTIFICATE_MISSING_ERROR'
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
