// 默认只过滤host这种常见的blocking
const test = require('./test');
function createFilter(blockingOptions, defaultValue = true) {
    let blockingFilter = () => {
        return defaultValue;
    };
    if (blockingOptions) {
        const type = typeof blockingOptions;
        // function
        if (type === 'function') {
            blockingFilter = blockingOptions;
        } else if (Array.isArray(blockingOptions)) {
            // array
            const filters = blockingOptions.map(item => {
                return createFilter(item, defaultValue);
            });
            blockingFilter = req => {
                for (const filter of filters) {
                    if (filter(req)) {
                        return defaultValue;
                    }
                }
                return !defaultValue;
            };
        } else {
            // string
            // 1. <key>=globString|<key>=globString
            // 2. globString -> host
            blockingFilter = req => {
                // const fns = parseRule(blockingOptions, defaultValue);
                // for (let fn of fns) {
                //     const r = fn(req);
                //     if (r === defaultValue) {
                //         break;
                //     }
                // }
                return test(blockingOptions, req.host);
            };
        }
    }
    return blockingFilter;
}
module.exports = createFilter;

// function parseRule(r, defaultKey = true) {
//     return r
//         .split('|')
//         .filter(a => a.trim())
//         .map(r => {
//             r = r.split('=');
//             let key = 'host';
//             let m;
//             if (r.length === 2) {
//                 [key, m] = r;
//             } else {
//                 m = r[0];
//             }
//             return req => {
//                 const keys = key.split('.');
//                 if (keys.length === 0) {
//                     return test(m, req[keys[0]]);
//                 }
//                 // 查找req
//                 let root = req;
//                 let latestKey;
//                 while ((latestKey = keys.shift())) {
//                     if (!root[latestKey]) {
//                         break;
//                     }
//                     root = root[latestKey];
//                 }
//                 if (root) {
//                     return test(m, root);
//                 }
//                 return defaultKey;
//             };
//         });
// }
