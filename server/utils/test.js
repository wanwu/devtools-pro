const isGlob = require('is-glob');
const micromatch = require('micromatch');
module.exports = function test(tester, testee) {
    if (tester === undefined || testee === undefined) {
        return true;
    }
    if (tester instanceof RegExp) {
        return tester.test(testee);
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

        throw new Error('Invalid interceptor filter.');
    }

    // custom matching
    if (typeof tester === 'function') {
        return !!tester(testee);
    }

    // 最后相等
    return matchSingleStringPath(tester, testee); // eslint-disable-line eqeqeq
};

function matchSingleStringPath(tester, testee) {
    return tester == testee;
}

function matchSingleGlobPath(pattern, testee) {
    const matches = micromatch([testee], pattern);
    return matches && matches.length > 0;
}

function matchMultiGlobPath(patternList, testee) {
    return matchSingleGlobPath(patternList, testee);
}

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
