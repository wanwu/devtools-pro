const path = require('path');
const send = require('koa-send');
const distPath = path.join(__dirname, '../../dist');
module.exports = router => {
    router.get('/launcher.js', async ctx => {
        await send(ctx, ctx.path, {root: distPath});
    });
    // router.get('/launcher.js', async ctx => {
    //     await send(ctx, ctx.path, {root: distPath});
    // });
};
