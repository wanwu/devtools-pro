const send = require('koa-send');

module.exports = async function sendFile(ctx, pathname, root) {
    try {
        return await send(ctx, pathname || ctx.path, {
            maxage: 60 * 60 * 2 * 1e3,
            root
        });
    } catch (err) {
        if (err.status !== 404) {
            throw err;
        }
    }
};
