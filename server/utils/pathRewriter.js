// source https://github.com/chimurai/http-proxy-middleware/blob/88136d181d/src/path-rewriter.ts
const isPlainObj = require('is-plain-obj');
const logger = require('./logger');

/**
 * Create rewrite function, to cache parsed rewrite rules.
 *
 * @param {Object} rewriteConfig
 * @return {Function} Function to rewrite paths; This function should accept `path` (request.url) as parameter
 */
module.exports = function createPathRewriter(rewriteConfig) {
    let rulesCache;

    if (!isValidRewriteConfig(rewriteConfig)) {
        return;
    }

    if (typeof rewriteConfig === 'function') {
        const customRewriteFn = rewriteConfig;
        return customRewriteFn;
    }
    rulesCache = parsePathRewriteRules(rewriteConfig);
    return rewritePath;

    function rewritePath(path) {
        let result = path;

        for (const rule of rulesCache) {
            if (rule.regex.test(path)) {
                result = result.replace(rule.regex, rule.value);
                logger.debug('[HPM] Rewriting path from "%s" to "%s"', path, result);
                break;
            }
        }

        return result;
    }
};

function isValidRewriteConfig(rewriteConfig) {
    if (typeof rewriteConfig === 'function') {
        return true;
    } else if (isPlainObj(rewriteConfig)) {
        return Object.keys(rewriteConfig).length !== 0;
    } else if (rewriteConfig === undefined || rewriteConfig === null) {
        return false;
    }
    throw new Error('Invalid pathRewrite config. Expecting object with pathRewrite config or a rewrite function');
}

function parsePathRewriteRules(rewriteConfig) {
    const rules = [];

    if (isPlainObj(rewriteConfig)) {
        for (const [key] of Object.entries(rewriteConfig)) {
            rules.push({
                regex: new RegExp(key),
                value: rewriteConfig[key]
            });
            logger.info('Proxy rewrite rule created: "%s" ~> "%s"', key, rewriteConfig[key]);
        }
    }

    return rules;
}
