const test = require('./test');
const isObject = obj => obj && obj.constructor && obj.constructor === Object;

module.exports = function match(options, context) {
    if (typeof options === 'function') {
        return options(context);
    }
    if (isObject(options)) {
        // const {path, url, headers, method, host, sourceType, userAgent, statusCode} = context;

        const keys = Object.keys(options).filter(key => key !== 'headers');
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = context[key];
            if (!test(options[key], value)) {
                return false;
            }
        }

        if (options.headers && context.headers) {
            const headersKey = Object.keys(options.headers);
            for (let i = 0; i < headersKey.length; i++) {
                const key = headersKey[i];
                const value = context.headers[key];
                if (!test(options.headers[key], value)) {
                    return false;
                }
            }
        }

        return true;
    }
    // 默认是string path路径匹配
    // - [x] 可以支持多个路径，比如：['/api', '/ajax'] √
    // - [x] 可以支持多个路径，比如：['/api/**', '!**.html']
    return test(options, context.path);
};
