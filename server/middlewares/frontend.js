const fs = require('fs');
const path = require('path');
const CHROME_FRONTEND_PATH = path.join(
    path.dirname(require.resolve('chrome-devtools-frontend/package.json')),
    'front_end'
);
const LOCAL_CHROME_FRONTEND_PATH = path.join(__dirname, '../../frontend');
const send = require('koa-send');
const logger = require('lighthouse-logger');
const LRU = require('lru-cache');
const lru = new LRU(130);
module.exports = router => {
    log = logger.loggerfn('middle:frontend');
    router.get('/devtools/(.+)', async (ctx, next) => {
        const relativePath = ctx.path.replace(/^\/devtools\//, '');
        let done = false;
        let realPath = lru.get(relativePath);

        if (realPath) {
            log(relativePath, 'use lru cache', realPath);
            await sendFile();
            return;
        }
        const absoluteFilePath = path.join(LOCAL_CHROME_FRONTEND_PATH, relativePath);
        let isFile;
        try {
            isFile = fs.existsSync(absoluteFilePath);
            isFile && log(`use local file: ${relativePath}`);
        } catch (e) {
            log(e);
        }
        realPath = isFile ? LOCAL_CHROME_FRONTEND_PATH : CHROME_FRONTEND_PATH;
        log(relativePath, realPath);
        lru.set(relativePath, realPath);

        //
        await sendFile();

        async function sendFile() {
            try {
                done = await send(ctx, relativePath, {
                    maxage: 60 * 60 * 2 * 1e3,
                    root: realPath
                });
            } catch (err) {
                if (err.status !== 404) {
                    throw err;
                }
            }
            if (!done) {
                await next();
            }
        }
    });
};
