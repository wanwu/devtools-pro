const path = require('path');
const sendFile = require('../utils/sendFile');

const distPath = path.join(__dirname, '../../dist');
module.exports = (router, logger, serverInstance) => {
    async function staticSend(ctx) {
        // 前面中间件有返回则不发送
        if (ctx.body != null || ctx.status !== 404) {
            logger.info(ctx.status);
            return;
        }
        logger.debug(ctx.path);
        return await sendFile(ctx, ctx.path, serverInstance.getDistPath());
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
