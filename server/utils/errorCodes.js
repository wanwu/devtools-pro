/**
 * @file https://github.com/websockets/ws/blob/5991c3548404e441129a16887e6a15250722a960/lib/validation.js#L33
 * 合法的 error code 范围是: [1000 1003] [1007 1014] [3000 4999]
 */

/**
 * Checks if a status code is allowed in a close frame.
 *
 * @param {Number} code The status code
 * @return {Boolean} `true` if the status code is valid, else `false`
 * @public
 */
function isValidStatusCode(code) {
    return (
        (
            code >= 1000
            && code <= 1014
            && code !== 1004
            && code !== 1005
            && code !== 1006
        )
        || (code >= 3000 && code <= 4999)
    );
}

module.exports = {
    isValidStatusCode,
    1000: 'normal',
    1001: 'going away',
    1002: 'protocol error',
    1003: 'unsupported data',
    1004: 'reserved',
    1005: 'reserved for extensions',
    1006: 'reserved for extensions',
    1007: 'inconsistent or invalid data',
    1008: 'policy violation',
    1009: 'message too big',
    1010: 'extension handshake missing',
    1011: 'an unexpected condition prevented the request from being fulfilled',
    1012: 'service restart',
    1013: 'try again later'
};
