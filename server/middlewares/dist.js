const path = require('path');
const logger = require('lighthouse-logger');
const send = require('koa-send');
const distPath = path.join(__dirname, '../../dist');
module.exports = router => {
    const log = logger.loggerfn('middle.dist');
    router.get('/(.+)', async (ctx, next) => {
        await next();
        if (ctx.body != null || ctx.status !== 404) {
            log(ctx.status);
            return;
        }

        log(ctx.path);
        try {
            await send(ctx, ctx.path, {root: distPath});
        } catch (err) {
            if (err.status !== 404) {
                throw err;
            }
        }
    });
    // app.use(require('koa-static')(distPath, {defer: true}));
    // router.get('/launcher.js', async ctx => {
    //     await send(ctx, ctx.path, {root: distPath});
    // });
};
