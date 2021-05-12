module.exports = router => {
    const protocolJson = require('./data/protocol.json');
    router.get('/json/protocol', ctx => {
        ctx.body = protocolJson;
    });
};
