const fs = require('fs');
const path = require('path');
const CHROME_FRONTEND_PATH = path.join(
    path.dirname(require.resolve('chrome-devtools-frontend/package.json')),
    'front_end'
);
const LOCAL_CHROME_FRONTEND_PATH = path.join(__dirname, '../../frontend');
const send = require('koa-send');
const logger = require('lighthouse-logger');

module.exports = router => {
    log = logger.loggerfn('middle:frontend');
    router.get('/devtools/(.+)', async (ctx, next) => {
        const relativePath = ctx.path.replace(/^\/devtools\//, '');
        const absoluteFilePath = path.join(LOCAL_CHROME_FRONTEND_PATH, relativePath);
        let isFile;
        try {
            isFile = fs.existsSync(absoluteFilePath);
            isFile && log(`use local file: ${relativePath}`);
        } catch (e) {
            log(e);
        }
        log(relativePath, isFile ? LOCAL_CHROME_FRONTEND_PATH : CHROME_FRONTEND_PATH);
        let done = false;
        try {
            done = await send(ctx, relativePath, {
                root: isFile ? LOCAL_CHROME_FRONTEND_PATH : CHROME_FRONTEND_PATH
            });
        } catch (err) {
            if (err.status !== 404) {
                throw err;
            }
        }
        if (!done) {
            await next();
        }
    });
};
