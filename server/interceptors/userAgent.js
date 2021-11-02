module.exports = (userAgent, callback) => {
    return interceptor => {
        interceptor.request.add(callback, {
            headers: {
                'User-Agent': userAgent
            }
        });
    };
};
