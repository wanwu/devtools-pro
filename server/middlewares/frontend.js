const fs = require('fs');
const path = require('path');
const CHROME_FRONTEND_PATH = path.join(__dirname, '../../chrome-devtools-frontend');
const PREFIXER = '/devtools';
const MODULES_JSON_FILE = 'devtools_app.json';
const LOCAL_CHROME_FRONTEND_PATH = path.join(__dirname, '../../frontend');
const send = require('koa-send');
const LRU = require('lru-cache');
const lru = new LRU(130);

module.exports = (router, logger, serverInstance) => {
    const log = logger.withTag('middle:frontend');
    // 生成devtools_app.json文件
    const modulesJsonFile = path.join(LOCAL_CHROME_FRONTEND_PATH, MODULES_JSON_FILE);
    const modulesJson = require(modulesJsonFile);
    const plugins = serverInstance._frontends || [];

    if (plugins) {
        plugins.forEach(({module, dir}) => {
            const name = module.name;
            log.debug(`添加frontend plugin router: ${PREFIXER}/${name}`);
            // 1. module 字段add到 devtools_app.json
            modulesJson.modules.push(module);
            // 2. 遇见name的folder，则转发
            router.get(`${PREFIXER}/${name}/(.+)`, createRouterMiddleware(name, dir, log));
        });
    }

    router.get(`${PREFIXER}/${MODULES_JSON_FILE}`, async (ctx, next) => {
        ctx.body = modulesJson;
    });
    router.get(`${PREFIXER}/(.+)`, async (ctx, next) => {
        const relativePath = ctx.path.replace(new RegExp(`^\\${PREFIXER}\\/`), '');

        let realPath = lru.get(relativePath);

        if (realPath) {
            log.debug(relativePath, 'use lru cache', realPath);
            await sendFile(ctx, next, relativePath, realPath, log);
            return;
        }
        const absoluteFilePath = path.join(LOCAL_CHROME_FRONTEND_PATH, relativePath);
        let isFile;
        try {
            isFile = fs.existsSync(absoluteFilePath);
            isFile && log.debug(`use local file: ${relativePath}`);
        } catch (e) {
            log.error(e);
        }
        realPath = isFile ? LOCAL_CHROME_FRONTEND_PATH : CHROME_FRONTEND_PATH;
        log.debug(relativePath, realPath);
        lru.set(relativePath, realPath);

        //
        await sendFile(ctx, next, relativePath, realPath, log);
    });
};
function createRouterMiddleware(name, dir, log) {
    return async (ctx, next) => {
        const relativePath = ctx.path.replace(new RegExp(`^\\${PREFIXER}\\/${name}\\/`), '');
        log.debug(`${relativePath} local to ${name} plugin`);
        await sendFile(ctx, next, relativePath, dir, log);
    };
}
async function sendFile(ctx, next, relativePath, root, log) {
    let done = false;
    try {
        log.debug(`sendFile ${relativePath}@${root}`);
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
