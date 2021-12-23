const {SourceMapConsumer} = require('source-map');
const http = require('http');

module.exports = class ParseSourceMap {
    /** 读取sourcemap文件内容 */
    async rawSourceMap(filepath) {
        return new Promise((resolve, reject) => {
            http.get(filepath, response => {
                const {statusCode, statusMessage} = response;
                if (statusCode !== 200) {
                    console.log('---statusCode statusMessage', statusCode, statusMessage);
                    // reject(new Error(JSON.stringify({
                    //     errno: statusCode,
                    //     msg: statusMessage
                    // })));
                    resolve({
                        errno: statusCode,
                        msg: statusMessage
                    });
                }
                else {
                    response.setEncoding('binary');
                    let Data = '';
                    response.on('data', data => {
                        Data += data;
                    }).on('end', () => {
                        resolve({
                            errno: 0,
                            data: Data,
                            msg: ''
                        });
                    });

                }
            });
        });
    }

    async stack(stack) {
        const lines = stack.split('\n');
        const newLines = [lines[0]];
        // 逐行处理
        for (const item of lines) {
            if (/ +at.+.js:\d+:\d+\)$/) {
                const arr = item.match(/\((https?:\/\/.+):(\d+):(\d+)\)$/i) || [];
                if (arr.length === 4) {
                    let url = arr[1];
                    let lineNumber = Number(arr[2]);
                    let columnNumber = Number(arr[3]);
                    let positionFile = url.split(')');
                    if (positionFile && positionFile.length > 1) {
                        positionFile = positionFile[0];
                        columnNumber = positionFile.split(':')[positionFile.split(':').length - 1];
                        lineNumber = positionFile.split(':')[positionFile.split(':').length - 2];
                        positionFile = positionFile.slice(0, positionFile.length - columnNumber.length - lineNumber.length - 2);
                    }
                    else {
                        positionFile = positionFile[0];
                    }
                    const res = await this.parse(positionFile + '.map', lineNumber, columnNumber);
                    if (res && res.source) {
                        const content = `    at ${res.name} (${[positionFile, res.line, res.column].join(':')})`;
                        newLines.push(content);
                    } else {
                        // 未解析成功则使用原错误信息
                        newLines.push(item);
                    }
                }
            }
        }
        return newLines.join('\n');
    }

    /** 根据行和列，从sourcemap中定位源码的位置 */
    async parse(filename, line, column) {
        const raw = await this.rawSourceMap(filename);
        if (!raw.errno) {
            console.log('---filename', filename);
            const consumer = await SourceMapConsumer.with(raw.data, null, consumer => consumer);
            return consumer.originalPositionFor({line, column});

        }
    }
};
