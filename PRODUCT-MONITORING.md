# 产品监控与老板看板

状态：正式发布已批准

## 入口与组成

- `product-metrics.html`：老板看板；页面不含密钥。
- `/api/analytics/events`：同源匿名事件批量写入。
- `/api/analytics/summary`：使用 `Authorization: Bearer <FEEDBACK_ADMIN_KEY>` 的只读汇总。
- `product-analytics-client.js`：正式入口引用的独立埋点运行时。
- `schema-product-analytics-migration.sql`：只新增监控表和索引的远端迁移文件。

看板密钥只保存在当前页面内存；关闭或刷新后重新输入。不要把管理员密钥写进网址、截图、
源代码或公开文档。

## 免费额度判断

截至 2026-08-04，Cloudflare Web Analytics 是免费、privacy-first 的访问统计；D1 Free 每天
包含 500 万行读取、10 万行写入和总计 5 GB 存储；Workers Free 每天包含 10 万次请求。
每批最多 20 个事件、每客户端默认 10 分钟最多 120 个事件，并保留 90 天原始事件。
对当前小规模产品，合理使用预计为 0 元；这不是永久价格承诺，需在 Cloudflare 用量页观察。

官方口径：

- https://developers.cloudflare.com/web-analytics/about/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/

## 数据边界

只保存事件名、环境、模式、语言、设备大类、来源大类、版本和服务器时间，以及加盐后的匿名
访客/会话哈希。不保存昵称、邮箱、阵容码、球员名单、比赛结果正文、反馈正文、查询字符串或
原始 IP，也不把监控标识与反馈、房间昵称关联。

## 看板口径

- 只展示 production 正式数据；测试环境只在服务端隔离，不出现在页面选择器。
- 观察窗口：12 小时、24 小时、3/7/14/30/90 天。
- 12 小时至 3 天按小时展示，其他窗口按天展示。
- 展示 NBA82、NBA5 离线、在线房间的用户数、会话、完成率、热门排序与跨模式路径。
- 底层按钮/成功状态事件不作为老板页面明细展示，只用于生成漏斗与模式转化。
- 登录后每 3 小时自动刷新，也可立即刷新；页面关闭后没有后台轮询。

## 发布顺序

1. 先备份并迁移远端 D1 schema。
2. 配置独立 `ANALYTICS_SALT`；若未配置，服务端回退到现有 `RATE_LIMIT_SALT`。
3. 将运行时以 `production` 环境合入正式入口，部署 Functions 和 `product-metrics.html`。
4. 线上分别验证事件 202、汇总 200、无密钥 401、跨站 403，并走一遍 NBA82。
5. 在 Cloudflare 控制台开启 Web Analytics，用它看 Visits/Page views/来源/性能；D1 看板只看
   产品行为漏斗，不混写两种口径。

用户已于 2026-08-04 明确批准执行以上远端操作。
