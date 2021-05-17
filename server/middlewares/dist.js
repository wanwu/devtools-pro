const path = require('path');
const sendFile = require('../utils/sendFile');

const distPath = path.join(__dirname, '../../dist');
module.exports = (router, logger) => {
    const log = logger.withTag('middle:dist');
    async function staticSend(ctx) {
        // 前面中间件有返回则不发送
        if (ctx.body != null || ctx.status !== 404) {
            log(ctx.status);
            return;
        }
        log.debug(ctx.path);
        return await sendFile(ctx, ctx.path, distPath);
    }

    router.get('/', async (ctx, next) => {
        ctx.path = '/index.html';
        await staticSend(ctx);
    });
    router.get('/(.+)', async (ctx, next) => {
        await next();
        await staticSend(ctx);
    });
};
