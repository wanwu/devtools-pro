// const fs = require('fs');
const getResourceType = require('../../utils/getResourceType');
const {injectAssetsIntoHtml} = require('../../utils/htmlUtils');
module.exports = ({request, response, websocketConnect}, proxyInstance) => {
    const rootInstance = proxyInstance.serverInstance;
    const port = rootInstance.getPort();
    let hostname = rootInstance.getHostname();
    if (hostname === '0.0.0.0' || hostname === '127.0.0.1') {
        hostname = 'devtools.pro';
    }
    const protocol = rootInstance.isSSL() ? 'wss:' : 'ws:';
    const backendjsUrl = `${
        rootInstance.isSSL() ? 'https' : 'http'
    }://${hostname}:${port}/backend.js?hostname=devtools.pro&port=${port}&protocol=${protocol}`;
    const id = response.add(({request: req, response: res}) => {
        const type = res.type;
        const resourceType = getResourceType(type);
        if (resourceType === 'Document') {
            const body = res.body.toString();
            const htmlRegExp = /(<html[^>]*>)/i;
            if (!htmlRegExp.test(body)) {
                return;
            }
            const html = injectAssetsIntoHtml(
                body,
                {},
                {
                    headTags: [
                        {
                            tagName: 'script',
                            attributes: {
                                src: backendjsUrl
                            }
                        }
                    ]
                }
            );
            res.body = Buffer.from(html);
        }
    });
    const reqId = request.add(
        ({request: req, response: res}) => {
            // 转发到127.0.0.1：xxx/backend.js
            // 这里的js需要统一走127，不能主动拦截
            // 因为backend.js 还可能被devtools plugin添加了佐料
            req.host = '127.0.0.1';
            // req.port = port;
            // res.end(fs.readFileSync(rootInstance.getDistPath() + '/backend.js'));
            req.rejectUnauthorized = false;
            // req.url = '/backend.js';
        },
        {host: 'devtools.pro'}
    );

    const wsId = websocketConnect.add(
        ({request}) => {
            request.host = '127.0.0.1';
            request.rejectUnauthorized = false;
        },
        {host: 'devtools.pro'}
    );

    return () => {
        response.remove(id);
        request.remove(reqId);
        websocketConnect.remove(wsId);
    };
};
