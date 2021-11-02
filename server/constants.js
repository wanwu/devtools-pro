exports.BACKEND_JS_FILE = '/backend.js';

exports.BACKENDJS_PATH = '/backend.js';

exports.FRONTEND_PATH = 'devtools/inspector.html';

exports.PROXY_INTERCEPTORS = {
    WEBSOCKET_FRAME: 'websocketFrame',

    // 在创建proxy request之前触发，接受proxy request options
    // 在发送 proxy request 之前触发，接受{req, res:fakeRes }
    // 可以使用res.end()返回mock数据，直接结束请求
    BEFORE_SEND_REQUEST: 'beforeSendRequest',
    // 在发送 proxy request 发送header之前触发
    // 发送错误触发
    ERROR_OCCURRED: 'errorOccurred',
    // 在发送response body之前触发，可以修改 res bod/header
    BEFORE_SEND_RESPONSE: 'beforeSendResponse'
};
