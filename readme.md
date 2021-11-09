<h1 align="center">Devtools-Pro</h1>

<div align="center">
A web remote debugging tools, based on Chrome DevTools.
</div>

![image](https://user-images.githubusercontent.com/1073262/118256057-9eceed00-b4df-11eb-94f4-74676c2d8c9b.png)

## 🎉 Features

-   基于 Chrome DevTools
-   基于 WebSocket 远程调试
-   可扩展，支持[自定义插件](./docs/advanced.md)
-   可编程的[代理功能](./docs/foxy.md)，抛弃 Fiddler/Charles 🌟（我们叫它 Foxy）

## 📦 Installation

```shell
npm i -g devtools-pro
# OR
yarn global add devtools-pro
```

## 命令行配置项

```bash
devtools-pro -h
# or
dp -h
```

```
Options:
  -h, --help      Show help                                            [boolean]
      --plugins   Add plugins                                            [array]
      --config    Provide path to a devtools configuration file e.g.
                  ./devtools.config.js     [string] [default: "devtools.config"]
  -o, --open      Open browser when server start       [boolean] [default: true]
      --https     Use HTTPS protocol.                                  [boolean]
  -p, --port      Port to use [8001]                                    [number]
  -proxyPort      Proxy server port to use [8002]                       [number]
      --verbose   Displays verbose logging            [boolean] [default: false]
      --hostname  Address to use [0.0.0.0]                              [string]
  -v, --version   Show version number                                  [boolean]
```

## 配置文件`devtools.config.js`

为了方便项目统一配置，DevTools-pro 支持配置文件，可以在项目中创建一个名为`devtools.config.js`的文件，支持的配置项如下：

-   logLevel：日志级别，支持`silent` `verbose`
-   sslCaDir：ca 证书目录，默认在`findcachedir('ssl')`中生成
-   port：server 端口号，默认 `8001`
-   hostname：默认 `0.0.0.0`
-   plugins：配置插件，[介绍](./docs/advanced.md)
-   https：如果要启用 https，可以设置`https=true`，DevTools-pro 会[自动生成 CA 证书供使用](./docs/rootCA.md)
-   proxy：
    -   `proxy.port`：代理服务器的端口号，默认 8002
    -   `proxy.plugins`：Foxy 插件
    -   `proxy.blockingFilter`：拦截过滤器，详见[Foxy 文档](./docs/foxy.md)

## 开发

1. clone

```bash
mkdir devtools-pro
git clone git@github.com:ksky521/devtools-pro.git devtools-pro
```

2. 安装依赖 & 初始化

```bash
yarn
# 初始化：将chrome-devtools-frontend/front_end复制出来
sh init.sh
```

3. 开始开发

```bash
yarn dev
```

访问：

-   1. 打开 home 页面：127.0.0.1:8001
-   2. 打开 demo 测试页面：点击 home 页面上测试页面链接 127.0.0.1:8001/demo.html
-   3. 打开 inspector：点击 home 页面上的【Open Chrome DevTools】

## 深入阅读

-   [DevTools-pro 原理](./docs/advanced.md)
-   [代理功能使用和原理](./docs/foxy.md)
-   [root CA 配置](./docs/rootCA.md)
