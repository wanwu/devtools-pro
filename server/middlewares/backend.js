const fs = require('fs');
const path = require('path');
const mergeStream = require('merge-stream');

const distPath = path.join(__dirname, '../../dist');
module.exports = (router, logger, serverInstance) => {
    const log = logger.loggerfn('middle:backend');
    router.get('/backend.js', async (ctx, next) => {
        const mergedStream = mergeStream(fs.createReadStream(path.join(distPath, ctx.path)));
        const backendFiles = serverInstance._backends || [];
        backendFiles.forEach(filepath => {
            log(`add ${filepath}`);
            mergedStream.add(fs.createReadStream(filepath));
        });
        ctx.body = mergedStream;
    });
};
