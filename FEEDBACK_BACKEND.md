# 独立反馈后台

这套后台使用 Cloudflare Pages Functions 与 D1，不依赖主页面代码。入口如下：

- `POST /api/feedback`：写入反馈
- `GET /api/feedback/list`：管理员分页查询
- `GET /api/feedback/image/:id`：管理员鉴权读取图片
- `/feedback-admin.html`：独立管理页

## 数据与安全边界

- 玩家不需要登录。反馈类型、称呼、邮箱、主题、内容、页面链接、阵容码和图片全部选填；空表单也可提交。
- 类型支持 `feedback`、`bug`、`feature`。称呼最多 80 个字符，主题最多 120 个字符，内容最多 5000 个字符。
- 邮箱非空时校验格式；页面链接非空时只接受 HTTP/HTTPS URL。
- 阵容码最多 4096 个字符；非空时校验 `NBA82-` Base64URL 负载、版本、5 张唯一球员卡及参数范围。
- 最多 3 张图片；单张不超过 600 KB，合计不超过 1.5 MB。
- 仅接受 JPEG、PNG、WebP、GIF，并校验文件签名；不接受 SVG。
- 图片作为独立 BLOB 行写入 D1。列表只返回元数据，避免大响应；管理页凭密钥按需读取。
- 有 `Origin` 的请求必须与目标 URL 同源；`Sec-Fetch-Site: cross-site` 会被拒绝。无 `Origin` 的服务端请求仍可使用 API。
- 提交端按加盐客户端指纹做 D1 固定窗口限流，默认 10 分钟 5 次；原始 IP 不入库。
- `_honey` 非空会作为机器人提交拒绝。
- 管理员密钥只接受 `Authorization: Bearer ...` 或 `X-Admin-Key` 请求头，不接受 URL 查询参数。

Cloudflare D1 当前单个字符串、BLOB 或表行上限为 2 MB；这里的 600 KB 单图限制为数据库行及请求处理预留了余量：
<https://developers.cloudflare.com/d1/platform/limits/>

## 提交接口

推荐前端使用 `multipart/form-data`：

```bash
curl -X POST https://your-domain.example/api/feedback \
  -F 'feedbackType=bug' \
  -F 'contactName=测试玩家' \
  -F 'contactEmail=player@example.com' \
  -F 'title=模拟结果异常' \
  -F 'content=第五场结束后战绩没有更新。' \
  -F 'pageUrl=https://your-domain.example/' \
  -F "lineupCode=${LINEUP_CODE}" \
  -F 'images=@./screenshot.png;type=image/png'
```

也支持 JSON；图片使用 Base64 或 data URL：

```json
{
  "feedbackType": "bug",
  "contactName": "测试玩家",
  "contactEmail": "player@example.com",
  "title": "模拟结果异常",
  "content": "第五场结束后战绩没有更新。",
  "pageUrl": "https://your-domain.example/",
  "lineupCode": "NBA82-...",
  "images": [
    {
      "name": "screenshot.png",
      "type": "image/png",
      "data": "iVBORw0KGgo..."
    }
  ],
  "_honey": ""
}
```

成功写库固定返回 HTTP 201。通知失败不改变写库结果：

```json
{
  "ok": true,
  "feedback": {
    "id": "UUID",
    "createdAt": "2026-07-23T08:00:00.000Z",
    "imageCount": 1
  },
  "emailStatus": "accepted",
  "emailStatusMessage": "通知 webhook 已接受请求，但邮件是否送达尚未验证。",
  "emailDeliveryVerified": false
}
```

`emailStatus` 只有以下语义：

- `accepted`：通知 webhook 返回 2xx；只代表 webhook 接受请求，不代表邮件已送达。
- `failed`：反馈已写入 D1，但 webhook 超时、网络失败或返回非 2xx。
- `not_configured`：反馈已写入 D1，未配置 webhook，因此没有尝试发信。

如果玩家填写了邮箱，通知 payload 会携带 `reply_to`，方便站长直接回复；未填写邮箱时不会生成该字段。

## 管理员查询

```bash
curl \
  -H "Authorization: Bearer ${FEEDBACK_ADMIN_KEY}" \
  'https://your-domain.example/api/feedback/list?limit=30'
```

响应中的 `nextCursor` 可原样传入下一页：

```text
/api/feedback/list?limit=30&cursor=<nextCursor>
```

不要把管理员密钥放在 URL。管理页只将密钥保存在当前标签页的 `sessionStorage`。

## D1 与 Pages 部署

在 `outputs/h5-beta` 目录执行：

1. 登录并创建数据库：

   ```bash
   npx wrangler login
   npx wrangler d1 create nba82-h5-beta-feedback
   ```

2. 将命令返回的真实 UUID 写入 `wrangler.toml` 的 `database_id`，替换全零占位值。绑定名必须保持为 `FEEDBACK_DB`。

3. 初始化本地与远程 schema：

   ```bash
   npx wrangler d1 execute nba82-h5-beta-feedback --local --file=./schema.sql
   npx wrangler d1 execute nba82-h5-beta-feedback --remote --file=./schema.sql
   ```

4. 如 Pages 项目尚不存在，先创建项目；随后设置必需 secret：

   ```bash
   npx wrangler pages project create nba-legend-season-simulator
   npx wrangler pages secret put FEEDBACK_ADMIN_KEY --project-name nba-legend-season-simulator
   npx wrangler pages secret put RATE_LIMIT_SALT --project-name nba-legend-season-simulator
   ```

   `FEEDBACK_ADMIN_KEY` 使用高熵随机值。`RATE_LIMIT_SALT` 使用另一段独立随机值，避免客户端指纹可被离线枚举。

5. 可选：配置通知 webhook。URL 与 token 按 secret 保存：

   ```bash
   npx wrangler pages secret put EMAIL_WEBHOOK_URL --project-name nba-legend-season-simulator
   npx wrangler pages secret put EMAIL_WEBHOOK_BEARER_TOKEN --project-name nba-legend-season-simulator
   ```

   通用 webhook 收到 JSON，字段包括 `event`、`to`、`feedback_id`、`feedback_type`、`contact_name`、`contact_email`、`title`、`message`、`page_url`、`lineup_code`、`image_count` 与 `submitted_at`。目标地址默认由 `wrangler.toml` 中的 `FEEDBACK_EMAIL_TO` 指定为 `3572280879@qq.com`。

6. 使用 Wrangler 或 Git 集成部署。不要使用 Pages 网页拖拽上传，因为该方式不会部署 `/functions`：

   ```bash
   npx wrangler pages deploy . --project-name nba-legend-season-simulator
   ```

Pages Functions 的 D1 绑定和本地运行说明：
<https://developers.cloudflare.com/pages/functions/bindings/#d1-databases>

## FormSubmit 兼容模式

可把 `EMAIL_WEBHOOK_URL` 设置为：

```text
https://formsubmit.co/ajax/3572280879@qq.com
```

通知 JSON 包含 FormSubmit 支持的 `_subject`、`_template`、`name` 和 `message` 字段。FormSubmit 第一次使用该收件地址时需要邮箱所有者完成确认；未完成确认前不能视为邮件已送达。即使 FormSubmit 返回 2xx，本 API 也只报告 `accepted` 与 `emailDeliveryVerified: false`。

FormSubmit AJAX 格式与确认流程：
<https://formsubmit.co/ajax-documentation>
<https://formsubmit.co/documentation>

## 本地运行

本地 secret 放在未提交的 `.dev.vars`：

```dotenv
FEEDBACK_ADMIN_KEY="local-admin-key"
RATE_LIMIT_SALT="local-rate-limit-salt"
# EMAIL_WEBHOOK_URL="https://formsubmit.co/ajax/3572280879@qq.com"
# EMAIL_WEBHOOK_BEARER_TOKEN="optional-token"
```

初始化本地 D1 后启动：

```bash
npx wrangler d1 execute nba82-h5-beta-feedback --local --file=./schema.sql
npx wrangler pages dev .
```

管理页地址通常为：

```text
http://127.0.0.1:8788/feedback-admin.html
```

运行纯函数测试：

```bash
node --test functions/_tests/*.test.mjs
```
