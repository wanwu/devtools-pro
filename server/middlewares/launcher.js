const path = require('path');
const logger = require('lighthouse-logger');
const send = require('koa-send');
const distPath = path.join(__dirname, '../../dist');
module.exports = router => {
    const log = logger.loggerfn('middle:launcher');
    router.get('/launcher.js', async (ctx, next) => {
        log('launcher.js');
        await send(ctx, ctx.path, {root: distPath});
    });
};
