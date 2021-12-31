module.exports = function copyHeaders(originalHeaders) {
    const headers = {};

    let keys = Object.keys(originalHeaders);
    // ignore chunked, gzip...
    keys = keys.filter(key => !['content-encoding', 'transfer-encoding'].includes(key.toLowerCase()));

    keys.forEach(key => {
        let value = originalHeaders[key];

        if (key === 'set-cookie') {
            // remove cookie domain
            value = Array.isArray(value) ? value : [value];
            value = value.map(x => x.replace(/Domain=[^;]+?/i, ''));
        } else {
            let canonizedKey = key.trim();
            if (/^public\-key\-pins/i.test(canonizedKey)) {
                // HPKP header => filter
                return;
            }
        }

        headers[key] = value;
    });
    headers['x-intercepted-by'] = 'devtools-pro-foxy';
    return headers;
};
