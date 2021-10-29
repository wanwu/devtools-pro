exports.BACKEND_JS_FILE = '/backend.js';

exports.BACKENDJS_PATH = '/backend.js';

exports.FRONTEND_PATH = 'devtools/inspector.html';

exports.FOXY_BUILDIN_HOOKS = {};

exports.FOXY_PUBLIC_HOOKS = {
    // 在创建proxy request之前触发，接受proxy request options
    // 用于rewrite请求options，比如修改域名对应关系
    BEFORE_CREATE_REQUEST: 'beforeCreateRequest',
    // 在发送 proxy request 之前触发，接受{req, res:fakeRes }
    // 可以使用res.end()返回mock数据，直接结束请求
    BEFORE_SEND_REQUEST: 'beforeSendRequest',
    // 在发送 proxy request 发送header之前触发
    // 用于修改request header
    BEFORE_SEND_REQUEST_HEADERS: 'beforeSendRequestHeaders',
    // 发送错误触发
    ERROR_OCCURRED: 'errorOccurred',
    // 在发送response header之前触发，可以修改response header
    BEFORE_SEND_RESPONSE_HEADERS: 'beforeSendResponseHeaders',
    // 在发送response body之前触发，可以修改 res body
    BEFORE_SEND_RESPONSE_BODY: 'beforeSendResponseBody'
};
