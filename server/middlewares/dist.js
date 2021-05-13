const path = require('path');
const logger = require('consola');
const send = require('koa-send');
const distPath = path.join(__dirname, '../../dist');
module.exports = router => {
    const log = logger.withTag('middle.dist');
    async function staticSend(ctx) {
        if (ctx.body != null || ctx.status !== 404) {
            log(ctx.status);
            return;
        }
        log.debug(ctx.path);

        try {
            await send(ctx, ctx.path, {
                maxage: 60 * 60 * 2 * 1e3,
                root: distPath
            });
        } catch (err) {
            if (err.status !== 404) {
                throw err;
            }
        }
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
