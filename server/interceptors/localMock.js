module.exports = (mockConfig, filterOptions) => {
    return interceptor => {
        interceptor.request.add(({request, response}) => {
            // 调用end，结束请求
            // response.end();
        }, filterOptions);
    };
};
