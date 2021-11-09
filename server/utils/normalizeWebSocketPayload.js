function normalizeWebSocketPayload(data) {
    // 过滤私有的数据
    if (Array.isArray(data)) {
        return data.map(d => normalizeWebSocketPayload(d));
    }
    const r = {};
    Object.keys(data).map(key => {
        if (/^_/.test(key)) {
            return;
        }
        if (typeof data[key] === 'object' || Array.isArray(data[key])) {
            return (r[key] = normalizeWebSocketPayload(data[key]));
        }
        r[key] = data[key];
    });
    return r;
}

module.exports = normalizeWebSocketPayload;
