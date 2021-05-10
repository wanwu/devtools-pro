const fs = require('fs');
const path = require('path');
const CHROME_FRONTEND_PATH = path.join(
    path.dirname(require.resolve('chrome-devtools-frontend/package.json')),
    'front_end'
);
const MODULES_JSON_FILE = 'devtools_app.json';
const LOCAL_CHROME_FRONTEND_PATH = path.join(__dirname, '../../frontend');
const send = require('koa-send');
const LRU = require('lru-cache');
const lru = new LRU(130);

module.exports = (router, logger, serverInstance) => {
    log = logger.loggerfn('middle:frontend');
    // 生成devtools_app.json文件
    const modulesJsonFile = path.join(LOCAL_CHROME_FRONTEND_PATH, MODULES_JSON_FILE);
    const modulesJson = require(modulesJsonFile);
    const plugins = serverInstance._frontends || [];

    if (plugins) {
        plugins.forEach(({module, dir}) => {
            // 1. module 字段add到 devtools_app.json
            modulesJson.modules.push(module);
            const name = module.name;
            // 2. 遇见name的folder，则转发
            router.get(`/devtools/${name}/(.+)`, createRouterMiddleware(name, dir));
        });
    }

    router.get(`/devtools/${MODULES_JSON_FILE}`, async (ctx, next) => {
        ctx.body = modulesJson;
    });
    router.get('/devtools/(.+)', async (ctx, next) => {
        const relativePath = ctx.path.replace(/^\/devtools\//, '');
        let realPath = lru.get(relativePath);

        if (realPath) {
            log(relativePath, 'use lru cache', realPath);
            await sendFile(ctx, next, relativePath, realPath);
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
        await sendFile(ctx, next, relativePath, realPath);
    });
};
function createRouterMiddleware(name, dir) {
    return async (ctx, next) => {
        const relativePath = ctx.path.replace(/^\/devtools\//, '');
        log(`${relativePath} local to ${name} plugin`);
        await sendFile(ctx, next, relativePath, dir);
    };
}
async function sendFile(ctx, next, relativePath, root) {
    let done = false;
    try {
        done = await send(ctx, relativePath, {
            maxage: 60 * 60 * 2 * 1e3,
            root
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
