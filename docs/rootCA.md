# SSL 证书安装

由于浏览器安全限制，在 https 协议页面添加 backend.js 需要使用 https，这时候需要启动 DevTools-pro 的 https server，如果启动 devtools-pro 的 https server 或者使用[Foxy 代理服务](./foxy.md)，那么你需要使用`--https`或者 config 文件中的`https`配置，这时候 DevTools-pro 会默认生成一个自认证的 CA 证书，可以通过`http://devtools.pro/ssl`下载或者 home 页面扫描对应二维码进行下载（前提是启动了 foxy 功能、并且设置对应机器的代理服务到 foxy 端口号）

CA 证书下载完毕后需要添加到信任列表中，在列表中找到**DevtoolsProFoxy**的证书，然后对应的操作可以参考 Fiddler/Charles 这类证书的安装方式。

![](./imgs/ca.png)

### 证书过期

证书默认生成了两年的有效期，如果过期则执行：`devtools-pro clean-ca`命令删除对应的证书，然后重新启动 devtools-pro，按照之前操作重新下载信任即可
