const path = require('path');
const logger = require('lighthouse-logger');
const send = require('koa-send');
const mergeStream = require('merge-stream');

const distPath = path.join(__dirname, '../../dist');
module.exports = router => {
    const log = logger.loggerfn('middle:backend');
    router.get('/backend.js', async (ctx, next) => {
        log('backend.js');
        await send(ctx, ctx.path, {root: distPath});
    });
};
