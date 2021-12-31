
/**
 * @file 断点调试相关
 */

// 获取运行时js的URL
let getCurrentScript = () => {
    let script;
    let scripts;
    let url;
    if (document.currentScript) {
        script = document.currentScript;
    }
    else {
        scripts = document.getElementsByTagName('script');
        script = scripts[scripts.length - 1];
    }
    url = script.hasAttribute ? script.src : script.getAttribute('src', 4);
    return url;
};
let reg = /^http(s)?:\/\/(.*?)\//;
let postHost = getCurrentScript().match(reg)[0];
window.__devtools_pro_tools_config__ = Object.assign({
    getCurrentScript
}, {
    // 待执行的表达式
    evaluateExpression: '',
    // 获取断点信息接口
    getBreakPointStateApi: `${postHost}debuggerconfiglist`,
    // 发送源码接口
    postResourceApi: `${postHost}postsources`,
    // 发送请求、断点、修改信息
    postRequsetInfoApi: `${postHost}postmessage`,
    // 获取call stack 对应 class 名称
    getClassName: (object, defaultName) => {
        let nameFromToStringRegex = /^function\s?([^\s(]*)/;
        let result = '';
        if (typeof object === 'function') {
            result = object.name || object.toString().match(nameFromToStringRegex)[1];
        } else if (typeof object.constructor === 'function') {
            result = window.__devtools_pro_tools_config__.getClassName(object.constructor, defaultName);
        }
        return result || defaultName;
    },
    // 同步请求
    sendSync: (method, url, body) => {
        let response;
        let xhr = new XMLHttpRequest();
        xhr.open(method, url, false);
        body = typeof body === 'object' ? JSON.stringify(body) : body;
        xhr.send(body);
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                response = xhr.response;
            }
        }
        response = response || {};
        response = (typeof response === 'string') ? JSON.parse(response) : {};
        return response;
    },
    // json序列化, JSON.stringify会丢失function
    serialize: (obj, name) => {
        let result = '';
        let getInstanceType = someObject => {
            const typeStr = Object.prototype.toString.call(someObject);
            let type = /(?<=\s).+(?=\])/.exec(typeStr)[0];
            return type || '';
        };
        let getInstanceValue = someObject => {
            let val = '()';
            if (someObject instanceof Set) {
                val = '(["' + Array.from(someObject).toString() + '"])';
            }
            return val;
        };
        let serializeInternal = (someObject, path) => {
            for (let p in someObject) {
                let value = someObject[p];
                if (typeof value !== 'object') {
                    if (typeof value === 'string') {
                        result += '\n' + path
                                + '[' + (isNaN(p) ? '"' + p + '"' : p) + '] = '
                                + '"' + value.replace(/\"/g, '\\"') + '"' + ';';
                    } else {
                        result += '\n' + path + '[' + (isNaN(p) ? '"' + p + '"' : p) + '] = ' + value + ';';
                    }
                } else {
                    if (value === null) {
                        result += '\n' + path + '[' + (isNaN(p) ? '"' + p + '"' : p) + ']' + '=' + 'null';
                    } else if (value instanceof Array) {
                        result += '\n' + path + '[' + (isNaN(p) ? '"' + p + '"' : p) + ']' + '=' + 'new Array();';
                        serializeInternal(
                            value,
                            path + '[' + (isNaN(p) ? '"' + p + '"' : p) + ']'
                        );
                    } else {
                        let type = getInstanceType(value);
                        if (['Set', 'Map', 'Date', 'RegExp', 'Error'].includes(type)) {
                            let oldVal = getInstanceValue(value);
                            result += '\n' + path + '['
                                + (isNaN(p) ? '"' + p + '"' : p) + ']' + '=' + `new ${type}${oldVal};`;
                        } else {
                            result += '\n' + path + '[' + (isNaN(p) ? '"' + p + '"' : p) + ']' + '=' + 'new Object();';
                            serializeInternal(
                                value,
                                path + '[' + (isNaN(p) ? '"' + p + '"' : p) + ']'
                            );
                        }
                    }
                }
            }
        };
        serializeInternal(obj, name);
        return result;
    },
    // 断点调试
    main: (index, originalCodes, evaluateExpressionCb) => {
        let source = originalCodes && originalCodes.source ? originalCodes.source : '';
        const linePrefix = 'LINE';

        let curJsUrl = window.__devtools_pro_tools_config__.getCurrentScript();
        let origin = location.origin;
        let filename = originalCodes && originalCodes.filename ? (origin + originalCodes.filename) : curJsUrl;
        let initalBreakPointFlag = false;
        let requestId = new Date().getTime();
        if (index < 0) {
            // 发送源码
            window.__devtools_pro_tools_config__.sendSync('POST', window.__devtools_pro_tools_config__.postResourceApi, {
                documentURL: origin,
                hasUserGesture: false,
                requestId,
                timestamp: new Date().getTime(),
                type: 'Script',
                wallTime: new Date().getTime(),
                request: {
                    headers: {},
                    initialPriority: 'High',
                    method: 'GET',
                    postData: '',
                    referrerPolicy: 'no-referrer-when-downgrade',
                    url: filename,
                    _hasReceived: true
                },
                response: {
                    encodedDataLength: source.length,
                    headers: {
                        'content-length': '0',
                        'content-type': '',
                        'x-powered-by': 'Devtools-Resource-Timing',
                    },
                    mimeType: 'application/javascript',
                    status: 200,
                    statusText: 'OK',
                    originalCode: source
                }
            });

            window.__devtools_pro_tools_config__.jsSourceMap[curJsUrl] = requestId;
            return;
        }
        let isPaused = false;
        let postInfo = {};
        while (true) {
            let tmp = window.__devtools_pro_tools_config__.sendSync('GET', window.__devtools_pro_tools_config__.getBreakPointStateApi);
            let curIndex = tmp[origin].curIndex || 0; // 操作行
            let curUrl = tmp[origin].curUrl || ''; // 操作文件路径
            // 断住的条件
            // 1、正好是断点处
            if (tmp && (tmp[origin]) && tmp[origin][filename]) {
                tmp[origin][filename].map(item => {
                    if (item.indexOf(linePrefix + index + '__') > -1) {
                        initalBreakPointFlag = true;
                    }
                });
            }
            curIndex = parseInt(curIndex, 10);
            index = parseInt(index, 10);
            // 跳出逻辑
            if (tmp[origin].stepType && tmp[origin].stepType === 'stepOver') {
                window.__devtools_pro_tools_config__.pausedType = 'stepOver';
                window.__devtools_pro_tools_config__.sendSync('POST', window.__devtools_pro_tools_config__.postRequsetInfoApi, {
                    method: 'Debugger.modifyStepType',
                    modifyMessage: {
                        origin: location.origin,
                        stepType: '',
                        curIndex: index,
                        curUrl: filename
                    }
                });
                break;
            }
            else if (tmp[origin].stepType && tmp[origin].stepType === 'resume') {
                window.__devtools_pro_tools_config__.pausedType = 'resume';
                window.__devtools_pro_tools_config__.sendSync('POST', window.__devtools_pro_tools_config__.postRequsetInfoApi, {
                    method: 'Debugger.modifyStepType',
                    modifyMessage: {
                        origin: location.origin,
                        stepType: '',
                        curIndex: index,
                        curUrl: filename
                    }
                });
                break;
            }
            else if (tmp[origin].stepType && tmp[origin].stepType === 'stepInto') {
                window.__devtools_pro_tools_config__.pausedType = 'stepInto';
                window.__devtools_pro_tools_config__.sendSync('POST', window.__devtools_pro_tools_config__.postRequsetInfoApi, {
                    method: 'Debugger.modifyStepType',
                    modifyMessage: {
                        origin: location.origin,
                        stepType: '',
                        curIndex: index,
                        curUrl: filename
                    }
                });
                break;
            }

            // 2、stepOver和stepInto要执行的位置
            if ((curUrl === filename) && (curIndex < index) && window.__devtools_pro_tools_config__.pausedType === 'stepOver') {
                initalBreakPointFlag = true;
            }
            else if (window.__devtools_pro_tools_config__.pausedType === 'stepInto') {
                initalBreakPointFlag = true;
            }

            if (tmp[origin].evaluateOnCallFrame && tmp[origin].evaluateOnCallFrame.id) {
                let expressionObj = tmp[origin].evaluateOnCallFrame;
                // 执行命令
                window.__devtools_pro_tools_config__.evaluateExpression = expressionObj.params.expression;
                let evalResult = evaluateExpressionCb && evaluateExpressionCb();
                // 修改断点信息，变量获取执行完成 清除变量信息

                evalResult && evalResult.default && (delete evalResult.default);
                let tmpResult = evalResult;
                if (typeof evalResult === 'object') {
                    tmpResult = window.__devtools_pro_tools_config__.serialize(evalResult, '__json_evaluate__');
                }
                let className = evalResult;
                if (typeof evalResult === 'object') {
                    className = window.__devtools_pro_tools_config__.getClassName(evalResult, 'Object');
                }
                let postResult = {
                    objectId: JSON.stringify({
                        injectedScriptId: 1,
                        id: expressionObj.id
                    }),
                    type: typeof evalResult,
                    // subtype: '',
                    value: tmpResult,
                    unserializableValue: tmpResult,
                    description: className,
                    preview: tmpResult,
                    customPreview: '',
                    configurable: true,
                    enumerable: true,
                    ownProtites: evalResult && Object.getOwnPropertyNames(evalResult) || []
                };
                if (typeof evalResult === 'object') {
                    postResult.className = className;
                }
                window.__devtools_pro_tools_config__.sendSync('POST', window.__devtools_pro_tools_config__.postRequsetInfoApi, {
                    method: 'Debugger.evaluateOnCallFrame',
                    id: expressionObj.id,
                    modifyMessage: {
                        origin: location.origin,
                        scriptId: window.__devtools_pro_tools_config__.handlerJsMap[filename],
                        url: filename,
                        id: expressionObj.id
                    },
                    result: {
                        result: postResult
                    }
                });
            }

            if (initalBreakPointFlag) {
                postInfo.curIndex = index;
                postInfo.curUrl = filename;
                postInfo.stepType = tmp[origin].stepType || '';
                if (!isPaused) {
                    // 断点调用堆栈信息，发送一次即可
                    isPaused = true;
                    window.__devtools_pro_tools_config__.evaluateExpression = '(new Error()).stack';
                    Error.stackTraceLimit = 100;
                    let stackCallBack = evaluateExpressionCb && evaluateExpressionCb();

                    window.__devtools_pro_tools_config__.sendSync('POST', window.__devtools_pro_tools_config__.postRequsetInfoApi, {
                        method: 'Debugger.paused',
                        params: {
                            urlMap: window.__devtools_pro_tools_config__.jsSourceMap,
                            stackInfo: stackCallBack,
                            scriptId: window.__devtools_pro_tools_config__.handlerJsMap[filename],
                            reason: '断点',
                            data: [],
                            hitBreakpoints: '',
                            asyncStackTrace: '',
                            asyncStackTraceId: '',
                            asyncCallStackTraceId: '',
                            origin: location.origin
                        },
                        modifyMessage: {
                            ...postInfo
                        }
                    });
                }
            }
            else {
                break;
            }
            continue;
        }
    },
    handlerJsMap: {},
    jsSourceMap: {},
    pausedType: ''
});

export let debuggerHandler = () => {
    // DOCUMENT 代码
    window.__devtools_pro_tools_config__.sendSync('POST', window.__devtools_pro_tools_config__.postResourceApi, {
        documentURL: location.href,
        hasUserGesture: false,
        requestId: new Date().getTime(),
        timestamp: new Date().getTime(),
        type: 'Document',
        wallTime: new Date().getTime(),
        request: {
            headers: {},
            initialPriority: 'High',
            method: 'GET',
            postData: '',
            referrerPolicy: 'no-referrer-when-downgrade',
            url: location.href
        },
        response: {
            encodedDataLength: 2222,
            headers: {
                'content-length': '0',
                'content-type': '',
                'x-powered-by': 'Devtools-Resource-Timing'
            },
            mimeType: 'text/html',
            status: 200,
            statusText: 'OK',
            originalCode: document.getElementsByTagName('html')[0].outerHTML
        }
    });
    // 每次进入页面都要重新修改resume等
    window.__devtools_pro_tools_config__.sendSync('POST', window.__devtools_pro_tools_config__.postRequsetInfoApi, {
        method: 'Debugger.modifyStepType',
        modifyMessage: {
            origin: location.origin,
            stepType: '',
            curUrl: '',
            curIndex: '',
            evaluateOnCallFrame: {}
        }
    });
};
// 更新home页
export let sendBackendChannelInfo = info => {
    window.__devtools_pro_tools_config__.sendSync('POST', window.__devtools_pro_tools_config__.postRequsetInfoApi, info);
};
