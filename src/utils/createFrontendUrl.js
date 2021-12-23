export const FRONTEND_PATH = 'devtools/inspector.html';

export default (protocol, hostname, port, id, documenturl) => {
    // 注意，这里是&，不是?链接！！
    return `${protocol}//${hostname}:${port}/${FRONTEND_PATH}?${
        protocol === 'https:' ? 'wss' : 'ws'
    }=${hostname}:${port}/frontend/${id}&documenturl=${documenturl}`;
};
