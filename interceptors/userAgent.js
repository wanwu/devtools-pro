module.exports = (userAgent, callback) => {
    return interceptor => {
        return interceptor.request.add(callback, {
            headers: {
                'User-Agent': userAgent
            }
        });
    };
};
