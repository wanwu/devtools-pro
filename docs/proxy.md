# Foxy 代理抓包功能 —— 用 Network 面板做 WebUI

> 利用中间人攻击原理，实现 http、https、websocket 抓包，可编程可扩展，支持插件、拦截器，使用 Chrome DevTools Network 面板做 UI 的「Fiddler」。

## 启动

## devtools.config.js 相关配置

## SSL 证书安装

1. PC 安装
2. macOS 安装
3. iOS 安装

## 可编程支持

> Foxy 支持使用拦截器功能来实现功能扩展。

### 拦截器

devtools-pro 的代理具有拦截器功能。拦截器用法如下：

```js
```

可用的拦截器包括：

-   `request`：在 request 阶段可以做请求转发和提前拦截返回 response，`params`：`{request,response}`
    -   可以读取 request 对象的内容，修改 request 对象配置，提前调用`response.end`返回数据
    -   提前返回数据则使用`response.end`，详细见 [response 对象](#response 对象)
-   `response`：response 阶段可以修改 response.body 内容，`params`：`{request,response}`
    -   在 response 阶段，可以对`response.body`进行修改
-   `websocketConnect`：websocket 建立连接阶段，可以用来做 websocket 转发，`params`：`{request}`
-   `websocketFrame`：每次收到 websocket 消息之后的拦截器，`params`：`{request,websocket}`

### request 对象

### response 对象

### websocket 对象

## 应用案例

> 1. 域名转发

> 2. 本地 mock 数据转发

> 3. 有条件的拦截：根据 UserAgent、域名进行拦截

> 4. response 数据修改

> 5. 自动注入 backend.js
