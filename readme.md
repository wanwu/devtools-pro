# Remote Devtools

## 开发

1. clone

```bash
mkdir chobitsu
git clone git@github.com:ksky521/chobitsu.git chobitsu

mkdir remote-devtools
git clone git@github.com:ksky521/remote-devtools.git remote-devtools
```

2. 安装依赖

```bash
yarn
```

3. 开始开发

```bash
yarn dev
```

访问：

-   home：localhost:8080/home.html
-   调试页面 demo：localhost:8080/demo.html
-   inspector：localhost:8989/inspector.html
-   backend.js: localhost:8080/backend.js

## devtools.config.js

```js
{
    logLevel: silent / verbose;
    port;
    hostname;
    https: {
        'ca', 'pfx', 'key', 'cert';
    }
    plugins;
}
```

## 插件开发

插件可以在`devtools.config.js`中通过`plugins`进行添加，一个 plugins 是一个 NPM 包，由以下三部分组成：

-   frontend：调试器前端，即 DevTools 的调试页面，按照 Chrome-Devtools-Frontend 写法进行定义，也可以使用 iframe 进行嵌入
-   backend：调试器后端，即被调试页面的引入的 js 实现
-   middleware：即 Koa 的中间件，用于增强 server 实现

三部分根据自己实际情况进行开发，并非都包含。三部分的定义是在 NPM 包的`package.json`中`devtools`字段，类似：

```json
{
    "name": "js-native-monitor",
    "version": "1.0.0",
    "main": "index.js",
    // ....
    "devtools": {
        // middleware
        "frontend": {
            "name": "jsna_monitor",
            "type": "", // remote/autostart
            "dir": "frontend"
        },
        // backend字段，该文件内容会被merge到backend.js中
        "backend": "index.js",
        // middleware
        "middleware": "middleware.js"
    }
}
```

### Frontend

### Backend

### Middleware

middleware 的定义是在

## plugin

```js
router, app, logger;
```
