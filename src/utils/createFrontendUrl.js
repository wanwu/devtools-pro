export const FRONTEND_PATH = 'devtools/inspector.html';

export default (protocol, hostname, port, id, frontendPath = FRONTEND_PATH, documenturl) => {
    // 注意，这里是&，不是?链接！！
    return `${protocol}//${hostname}:${port}/${frontendPath}?${
        protocol === 'https:' ? 'wss' : 'ws'
    }=${hostname}:${port}/frontend/${id}&documenturl=${documenturl}`;
};
