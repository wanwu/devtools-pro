const fs = require('fs');
const path = require('path');
const CHROME_FRONTEND_PATH = path.join(
    path.dirname(require.resolve('chrome-devtools-frontend/package.json')),
    'front_end'
);
const LOCAL_CHROME_FRONTEND_PATH = path.join(__dirname, '../../chrome-devtools-frontend');
const send = require('koa-send');
module.exports = router => {
    // router()
    router.get('/devtools/(.+)', async ctx => {
        const relativePath = ctx.params[0];
        const absoluteFilePath = path.join(LOCAL_CHROME_FRONTEND_PATH, relativePath);
        let isFile;
        try {
            isFile = fs.existsSync(absoluteFilePath);
        } catch (e) {}
        await send(ctx, relativePath, {root: isFile ? LOCAL_CHROME_FRONTEND_PATH : CHROME_FRONTEND_PATH});
    });
};
