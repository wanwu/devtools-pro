const fs = require('fs');
const path = require('path');
const mimeType = require('mime-types');
const logger = require('../server/utils/logger');
module.exports = (mockConfig, filterOptions) => {
    // [{host: '', path: ''}, 'path string'/ function]
    return interceptor => {
        return interceptor.request.add(async ({request, response}) => {
            if (typeof mockConfig === 'function') {
                const p = await mockConfig(request, response);
                if (response.finished) {
                    // 已经执行了response.end()，说明自己反悔了
                    return;
                }
                if (typeof p === 'string') {
                    // 当做返回路径处理
                    mockConfig = p;
                }
            }
            if (typeof mockConfig === 'string') {
                // 作为文件路径
                path.isAbsolute(mockConfig) || (mockConfig = path.join(process.cwd(), mockConfig));
                // 从url得到path
                const url = request.url.split('?')[0];
                const filepath = path.join(mockConfig, url);
                try {
                    const contentType = mimeType.lookup(filepath);
                    response.type = contentType;
                    response.end(fs.readFileSync(filepath));
                } catch (e) {
                    logger.info('localmock inerceptor 读取文件失败');
                    logger.error(e);
                }
            }
            // 调用end，结束请求
            // response.end();
        }, filterOptions);
    };
};
