module.exports = (router, logger) => {
    router.get('/_alive_/(.+)', async (ctx, next) => {
        const targetId = ctx.params[0];
        if (targetId) {
            const backendChannel = ctx
                .getWebSocketServer()
                .getChannelManager()
                .getBackendById(targetId);
            const isAlive = backendChannel && backendChannel.alive;
            logger.debug(targetId, !!isAlive);

            if (isAlive) {
                ctx.body = '1';
            } else {
                ctx.body = '0';
            }
        } else {
            ctx.body = '-1';
        }
        return;
    });
};
