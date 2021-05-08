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
-   launcher.js: localhost:8080/launcher.js

## devtools.config.js

```js
{
    logLevel;
    port;
    hostname;
    https;
}
```

## plugin

```js
router, app, logger;
```
