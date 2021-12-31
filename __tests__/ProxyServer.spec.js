/* global test,describe, it,beforeAll,afterAll,expect */
const http = require('http');
const {promisify} = require('util');
const got = require('got');
const {HttpProxyAgent} = require('hpagent');
const nodeStatic = require('node-static');
const Server = require('../server/Server');
const testHost = '0.0.0.0';
const testPort = 8002;

const serverPort = 8001;

const fileStaticA = new nodeStatic.Server(__dirname + '/wwwA');
const fileStaticB = new nodeStatic.Server(__dirname + '/wwwB');
const testHostA = '127.0.0.1';
const testHostB = 'localhost';
const testPortA = 40005;
const testPortB = 40006;

const httpAgent = new HttpProxyAgent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 256,
    scheduling: 'lifo',
    maxFreeSockets: 256,
    proxy: `http://127.0.0.1:${testPort}`
});

function get(url) {
    return got(url, {
        timeout: 1000,
        agent: {
            http: httpAgent
        }
    });
}
let server;
let srvA;
let srvB;

describe('ProxyServer interceptor', () => {
    beforeAll(async () => {
        server = new Server({
            port: serverPort,
            proxy: {
                port: testPort,
                plugins: [
                    interceptor => {
                        interceptor.request.add(({request, response}) => {
                            if (request.url === '/hello') {
                                response.end('world');
                                return;
                            }
                            if (request.url === '/') {
                                request.host = testHostB;
                                request.port = testPortB;
                            }
                        }, testHostA);
                        interceptor.response.add(({request, response}) => {
                            if (request.url === '/index.js') {
                                response.body = 'mitm!';
                            }
                        }, testHostA);
                    }
                ]
            }
        });

        await promisify(server.listen.bind(server))(serverPort, testHost);
        // 创建server A
        srvA = http.createServer((req, res) => {
            req.addListener('end', () => {
                fileStaticA.serve(req, res);
            }).resume();
        });

        await promisify(srvA.listen.bind(srvA))(testPortA, testHostA);
        // 创建server B
        srvB = http.createServer((req, res) => {
            req.addListener('end', () => {
                fileStaticB.serve(req, res);
            }).resume();
        });
        await promisify(srvB.listen.bind(srvB))(testPortB, testHostB);
    });
    afterAll(() => {
        srvA.close();
        srvA = null;
        srvB.close();
        srvB = null;
        server.close();
        server = null;
    });

    it('访问a,返回b', async () => {
        const res = await get(`http://${testHostA}:${testPortA}`).catch(e => console.log(e));
        expect(res.body).toMatch(/<title>WWWB/);
    });
    it('访问不存在的hello，返回world', async () => {
        // 访问hello页面，返回world
        const res = await get(`http://${testHostA}:${testPortA}/hello`).catch(e => console.log(e));
        expect(res.body).toEqual('world');
    });
    it('注入res.body', async () => {
        const res = await get(`http://${testHostA}:${testPortA}/index.js`).catch(e => console.log(e));
        expect(res.body).toEqual('mitm!');
    });
});
