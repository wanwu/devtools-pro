const path = require('path');
const send = require('koa-send');
const pubPath = path.join(__dirname, '../../public');
module.exports = router => {
    router.get('/pages/(.+)', async ctx => {
        const p = ctx.params[0];
        await send(ctx, p, {root: pubPath});
    });
};
