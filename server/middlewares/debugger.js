/**
 * file debugger.js 断点调试
 */

const fs = require('fs');
const ParseSourceMap = require('./parseSourceMap.js');
const {readDebuggerConfig, writeDebuggerConfig} = require('../utils/modifyDebuggerInfo.js');

const defaultFn = ['handlerDebuggerSCope', 'eval', 'window.__acorn__parse__fn', '__webpack_require__', '__acorn__parse__fn'];
// 解析上下文里node原生请求的POST参数
function parsePostData(ctx) {
    return new Promise((resolve, reject) => {
        try {
            let postdata = '';
            ctx.req.addListener('data', data => {
                postdata += data;
            });
            ctx.req.addListener('end', () => {
                let parseData = JSON.parse(postdata);
                resolve(parseData);
            });
        } catch (err) {
            reject(err);
        }
    });
}

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}

module.exports = (router, logger, serverInstance) => {
    // 获取断点信息
    router.get('/debuggerconfiglist', async (ctx, next) => {
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.set('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With , yourHeaderFeild');
        ctx.set('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
        await wait(200);
        let debuggerUrlMap = readDebuggerConfig();
        ctx.body = debuggerUrlMap;
    });
    // 发送源码
    router.post('/postsources', async (ctx, next) => {
        // 如何转发给frontend ws
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.set('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With , yourHeaderFeild');
        ctx.set('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
        let pastData = await parsePostData(ctx);
        ctx.body = pastData;
        serverInstance._wsServer.channelManager._frontendMap.forEach((item, key) => {
            item.channel.send({
                method: 'Network.requestWillBeSent',
                params: pastData
            });
            item.channel.send({
                method: 'Network.responseReceived',
                params: pastData
            });
            item.channel.send({
                method: 'Network.loadingFinished',
                params: pastData
            });
            // 此事件收集断点信息
            item.channel.send({
                method: 'Debugger.scriptParsed',
                params: {
                    scriptId: pastData.requestId,
                    startColumn: 0,
                    startLine: 0,
                    endColumn: 100000,
                    endLine: 100000,
                    scriptLanguage: 'JavaScript',
                    url: pastData.request.url,
                    sourceMapURL: '',
                    length: pastData.response.encodedDataLength,
                    isModule: false,
                    isLiveEdit: false,
                    hash: 'eeee',
                    hasSourceURL: false,
                    executionContextId: pastData.requestId,
                    executionContextAuxData: {
                        isDefault: true
                    }
                }
            });
        });
        ctx.body = {
            errno: 0
        };
    });
    // 修改断点信息
    router.post('/postmessage', async (ctx, next) => {
        let serverManager = serverInstance._wsServer.channelManager;
        // 如何转发给frontend ws
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.set('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With , yourHeaderFeild');
        ctx.set('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
        let pastData = await parsePostData(ctx);
        ctx.body = pastData;
        let callFrames = [];
        if (pastData.params && pastData.method === 'Debugger.paused') {
            const parser = new ParseSourceMap();
            const stackCallBack = await parser.stack(pastData.params.stackInfo);

            let reg = new RegExp(/at\s(.*?)\s/);
            stackCallBack.split('\n').map(val => {
                if (val.match(reg) && val.match(reg).length > 1) {
                    let arr = val.match(reg);

                    if (defaultFn.indexOf(arr[1]) < 0) {
                        let arr2 = arr.input.split('(');
                        let positionFile = '';
                        let lineNumber = '';
                        let columnNumber = '';

                        if (arr2.length > 2) {
                            positionFile = arr2[2];
                        }
                        else if (arr2.length > 1) {
                            positionFile = arr2[1];
                        }
                        if (arr2.length > 1) {
                            positionFile = positionFile.split(')')[0];
                            if (positionFile.split(':').length > 2) {
                                columnNumber = positionFile.split(':')[positionFile.split(':').length - 1];
                                lineNumber = positionFile.split(':')[positionFile.split(':').length - 2];
                                positionFile = positionFile.slice(0, positionFile.length - columnNumber.length - lineNumber.length - 2);

                            }
                        }
                        callFrames.push({
                            functionName: (arr[1].indexOf('anonymous') > -1) ? 'anonymous' : arr[1],
                            scriptId: pastData.params.urlMap[positionFile],
                            columnNumber,
                            lineNumber,
                            url: positionFile,
                            location: {
                                columnNumber,
                                lineNumber,
                                url: positionFile,
                                scriptId: pastData.params.urlMap[positionFile]
                            },
                            scopeChain: [{
                                type: 'global',
                                endLocation: {
                                    scriptId: pastData.params.urlMap[positionFile],
                                    columnNumber,
                                    lineNumber,
                                },
                                startLocation: {
                                    scriptId: pastData.params.urlMap[positionFile],
                                    columnNumber,
                                    lineNumber
                                },
                                object: {

                                }
                            }]
                        });

                    }
                }
            });
            if (pastData.modifyMessage && pastData.modifyMessage.curIndex) {
                callFrames[0].location = {
                    columnNumber: 0,
                    lineNumber: pastData.modifyMessage.curIndex,
                    url: pastData.modifyMessage.curUrl,
                    scriptId: pastData.params.urlMap[pastData.modifyMessage.curUrl]
                };
            }

            pastData.params.callFrames = callFrames;
        }
        if (pastData.modifyMessage) {
            // 修改
            let origin = pastData.modifyMessage.origin;
            let debuggerUrlMap = readDebuggerConfig();
            let config = debuggerUrlMap[origin] || {};
            debuggerUrlMap[origin] = config;
            if (pastData.method && pastData.method === 'Debugger.modifyStepType' || pastData.method === 'Debugger.initalResume' || pastData.method === 'Debugger.paused') {
                Object.assign(debuggerUrlMap[origin], pastData.modifyMessage);
            }
            else if (config.evaluateOnCallFrame && config.evaluateOnCallFrame.id && config.evaluateOnCallFrame.id === pastData.modifyMessage.id) {
                config.evaluateOnCallFrame = '';
            }
            writeDebuggerConfig(debuggerUrlMap);
            delete pastData.modifyMessage;
        }
        if (pastData.event === 'updateBackendInfo') {
            const {payload} = pastData;
            // 更新title等信息
            if (payload && payload.id) {
                const data = serverManager._backendMap.get(payload.id);
                if (data && payload) {
                    for (let [key, value] of Object.entries(payload)) {
                        data[key] = value;
                    }
                    serverManager._backendMap.set(payload.id, data);
                }
                serverInstance._wsServer.manager.send({event: 'backendUpdate', payload: data});
            }
        }
        else if (pastData.method !== 'Debugger.modifyStepType') {
            serverManager._frontendMap.forEach((item, key) => {
                item.channel.send({
                    ...pastData
                });
            });
        }
        ctx.body = {
            errno: 0
        };
    });
};
