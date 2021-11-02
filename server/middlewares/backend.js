const fs = require('fs');
const path = require('path');
// const mergeStream = require('merge-stream');

const distPath = path.join(__dirname, '../../dist');
module.exports = (router, logger, serverInstance) => {
    const beFilepath = path.join(distPath, 'backend.js');
    router.get('/backend.js', async (ctx, next) => {
        let s = fs.readFileSync(beFilepath).toString();
        const backendFiles = serverInstance._backends || [];
        backendFiles.forEach(filepath => {
            s += fs.readFileSync(filepath).toString();
        });

        // const mergedStream = mergeStream(fs.createReadStream(beFilepath));
        // const backendFiles = serverInstance._backends || [];
        // backendFiles.forEach(filepath => {
        //     log.debug(`add ${filepath}`);
        //     mergedStream.add(fs.createReadStream(filepath));
        // });
        // console.log(mergedStream.toString());
        // ctx.body = mergedStream;
        ctx.res.setHeader('Content-Type', 'application/javascript');
        ctx.body = s;
    });
};
