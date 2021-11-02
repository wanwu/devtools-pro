module.exports = (userAgent, callback) => {
    return interceptor => {
        interceptor.request.add(callback, {
            userAgent
        });
    };
};
