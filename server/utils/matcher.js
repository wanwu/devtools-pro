const isGlob = require('is-glob');
const micromatch = require('micromatch');
const isObject = obj => obj && obj.constructor && obj.constructor === Object;

module.exports = function match(context, req) {
    const url = req.url;
    // - [x] 可以支持多个路径，比如：['/api', '/ajax'] √
    // - [x] 可以支持多个路径，比如：['/api/**', '!**.html']

    // 所以 url/method/headers 够用
    if (isObject(context)) {
        const {headers} = context;
        let isMatch = 1;
        ['method', 'url'].forEach(k => {
            if (req[k]) {
                isMatch &= test(context[k], req[k]);
            }
        });
        if (headers && req.headers && isObject(headers)) {
            Object.keys(headers).forEach(k => {
                isMatch &= test(headers[k], req.headers[k]);
            });
        }
        return isMatch;
    }
    // 默认是path路径匹配
    return test(context, url);
};

function test(tester, testee) {
    if (tester === undefined || testee === undefined) {
        return true;
    }
    if (tester instanceof RegExp) {
        return tester.test(testee);
    }
    if (isStringPath(tester)) {
        return matchSingleStringPath(tester, testee);
    }

    // single glob path
    if (isGlobPath(tester)) {
        return matchSingleGlobPath(tester, testee);
    }

    // multi path
    if (Array.isArray(tester)) {
        if (tester.every(isStringPath)) {
            return matchMultiPath(tester, testee);
        }
        if (tester.every(isGlobPath)) {
            return matchMultiGlobPath(tester, testee);
        }

        throw new Error(
            'Invalid interceptor filter. Expecting something like: ["/api", "/ajax"] or ["/api/**", "!**.html"]'
        );
    }

    // custom matching
    if (typeof tester === 'function') {
        return !!tester(testee);
    }

    // 最后相等
    return tester == testee; // eslint-disable-line eqeqeq
}
/**
 * @param  {String} context '/api'
 * @param  {String} uri     'http://example.org/api/b/c/d.html'
 * @return {Boolean}
 */
function matchSingleStringPath(tester, testee) {
    return testee.indexOf(tester) === 0;
}

function matchSingleGlobPath(pattern, testee) {
    const matches = micromatch([testee], pattern);
    return matches && matches.length > 0;
}

function matchMultiGlobPath(patternList, testee) {
    return matchSingleGlobPath(patternList, testee);
}

/**
 * @param  {String} arr ['/api', '/ajax']
 * @param  {String} testee     'http://example.org/api/b/c/d.html'
 * @return {Boolean}
 */
function matchMultiPath(arr, testee) {
    let isMultiPath = false;

    for (const tester of arr) {
        if (matchSingleStringPath(tester, testee)) {
            isMultiPath = true;
            break;
        }
    }

    return isMultiPath;
}
function isStringPath(context) {
    return typeof context === 'string' && !isGlob(context);
}

function isGlobPath(context) {
    return isGlob(context);
}
