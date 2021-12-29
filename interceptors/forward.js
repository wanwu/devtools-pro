/**
 *
 * @param {Sting|Function} forwardConfig 转发配置
 * @param {Sting|function|object} filterOptions filter配置
 * @returns
 */
module.exports = (forwardConfig, filterOptions) => {
    return interceptor => {
        // TODO 实现它
        // 将百度域名转到到google域名：forwardConfig = {host:'google.com'}, filterOptions = {host:'baidu.com'}
        // 将luoyi.baidu.com 转发到 172.102.112.233:8080
        // -> forwardConfig = {host:'172.102.112.233',port:8080}, filterOptions = {host:'luoyi.baidu.com'}
        // 自定义转发配置：forwardConfig = fn(request, response)
        return interceptor.request.add(async ({request, response}) => {
            if (typeof forwardConfig === 'function') {
                return await forwardConfig(request, response);
            }
            if (typeof forwardConfig === 'object') {
                Object.keys(forwardConfig).forEach(key => {
                    request[key] = forwardConfig[key];
                });
            }
            // 调用end，结束请求
            // response.end();
        }, filterOptions);
    };
};
