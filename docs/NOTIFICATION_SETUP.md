# 开发者反馈通知配置指南

## 工作原理

用户提交反馈 → 后端存入数据库 → 自动向你配置的 webhook 地址发送 POST 请求

## 配置步骤

### 第 1 步：选择一个通知服务（任选其一）

#### 方案 A：企业微信机器人（推荐）
1. 打开企业微信 → 选择一个群 → 群设置 → 群机器人 → 添加机器人
2. 复制 Webhook 地址，格式：`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxx`
3. 这个地址可以直接接收 JSON 消息

#### 方案 B：钉钉机器人
1. 打开钉钉 → 选择一个群 → 群设置 → 智能群助手 → 添加机器人 → 自定义
2. 安全设置选择"自定义关键词"，填入 `反馈`
3. 复制 Webhook 地址，格式：`https://oapi.dingtalk.com/robot/send?access_token=xxxxx`

#### 方案 C：飞书机器人
1. 打开飞书 → 选择一个群 → 群设置 → 群机器人 → 添加机器人 → 自定义机器人
2. 复制 Webhook 地址，格式：`https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx`

#### 方案 D：Server 酱（最简单，无需群聊）
1. 访问 https://sct.ftqq.com/
2. 用微信扫码登录
3. 获取 SendKey，你的地址是：`https://sctapi.ftqq.com/你的SendKey.send`

### 第 2 步：配置 webhook 地址

启动后端服务后，用以下命令配置（替换成你的真实地址）：

```bash
curl -X POST http://localhost:3000/feedback/webhook/config \
  -H "Content-Type: application/json" \
  -d '{"webhook_url": "你的webhook地址"}'
```

或者用 Postman / Apifox 等工具发送 POST 请求：
- URL: `http://localhost:3000/feedback/webhook/config`
- Method: `POST`
- Headers: `Content-Type: application/json`
- Body: `{"webhook_url": "你的webhook地址"}`

### 第 3 步：测试通知

```bash
curl -X POST http://localhost:3000/feedback/webhook/test
```

如果返回 `{"code":0,"message":"测试通知发送成功"}` 说明配置成功。

### 第 4 步：查看配置状态

```bash
curl http://localhost:3000/feedback/webhook/status
```

## 通知数据格式

当用户提交反馈时，你的 webhook 会收到：

```json
{
  "type": "feedback",
  "feedback_id": 1,
  "content": "用户反馈的具体内容",
  "openid": "用户的openid",
  "timestamp": "2026-08-19 14:30:00",
  "message": "收到新的用户反馈 #1"
}
```

## 常见问题

**Q: 配置后收不到通知？**
- 先运行测试接口 `/feedback/webhook/test` 看是否成功
- 检查 webhook 地址是否正确（特别是 key/token 部分）
- 查看后端控制台日志，通知失败会打印错误信息

**Q: 企业微信/钉钉/飞书机器人收不到消息？**
- 这些平台的机器人有特定的消息格式要求
- 如果直接发 JSON 不显示，可能需要一个中间转换服务
- 推荐使用 Server 酱（方案 D），它会自动把消息推送到你的微信

**Q: 配置会丢失吗？**
- 不会。配置保存在 MySQL 数据库的 `settings` 表中
- 重启服务后配置依然有效

**Q: 通知失败会影响用户提交反馈吗？**
- 不会。通知是异步的，失败只会在后端打印日志
- 用户的反馈一定会保存到数据库
