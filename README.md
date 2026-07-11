# NBA 巨星常规赛战绩模拟器 H5 公测包

这个文件夹可以直接作为静态网站部署。

## 文件结构

- `index.html`：主游戏入口
- `player-library.html`：球员库
- `scoring-model.html`：模型说明
- `rating-audit.html`：评分审计页
- `assets/`：卡面和资源清单

## 本地预览

在项目根目录运行：

```bash
python3 -m http.server 8768
```

然后打开：

```text
http://127.0.0.1:8768/outputs/h5-beta/index.html
```

## 部署方式

最简单的方式是把整个 `h5-beta` 文件夹拖到 Netlify Drop、Vercel、Cloudflare Pages 或其他静态网站托管服务。

部署后分享托管平台生成的网址即可。

## 上线前注意

- 不要用 `file://` 直接打开，球员库需要 `fetch` 读取主页面里的卡池数据。
- 如果以后换正式域名，所有链接已经是相对路径，不需要改代码。
- 公开传播前建议再确认卡面版权风险。
