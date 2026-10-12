# 微信小程序工具箱 · 后端 API 参考

本文档描述 `src/server/` 下 Flask 后端对外暴露的**全部 HTTP 接口**，内容全部依据源码整理，可直接作为对接与二次开发的参考。

- 后端框架：Flask 3（蓝图分模块挂载，见 `app.py`）
- 数据存储：MySQL（PyMySQL），按 `openid` 做用户隔离
- 返回格式：JSON（UTF-8，`app.json.ensure_ascii = False`，中文不转义）
- 共 **47** 个路由

---

## 目录

- [1. 概览](#sec-overview)
  - [1.1 基础地址](#sec-base-url)
  - [1.2 请求约定](#sec-request)
  - [1.3 统一响应结构](#sec-envelope)
  - [1.4 用户身份：`X-WX-OPENID`](#sec-openid)
  - [1.5 跨域（CORS）](#sec-cors)
- [2. 错误码与 HTTP 状态码](#sec-errors)
- [3. 接口总览](#sec-index)
- [4. 基础 / 健康检查](#sec-basic)
- [5. 日期与换算](#sec-convert)
- [6. 计算器](#sec-calc)
- [7. 生活工具](#sec-life)
  - [7.1 记账本 `/account/*`](#sec-account)
  - [7.2 待办清单 `/todo/*`](#sec-todo)
  - [7.3 习惯打卡 `/habit/*`](#sec-habit)
  - [7.4 通知设置 `/notify/*`](#sec-notify)
- [8. 文本与图像](#sec-media)
- [9. 娱乐](#sec-fun)
- [10. 反馈与回调](#sec-feedback)
- [11. 依赖 MySQL 的接口](#sec-mysql)
- [12. 依赖腾讯云密钥的接口](#sec-tencent)
- [13. 附录：环境变量与数据表](#sec-appendix)

---

<a id="sec-overview"></a>

## 1. 概览

<a id="sec-base-url"></a>

### 1.1 基础地址

| 环境 | 访问方式 | 说明 |
| --- | --- | --- |
| 本地联调 | `http://127.0.0.1:3000` | `app.py` 中 `PORT` 环境变量默认 `3000`，监听 `0.0.0.0` |
| 生产（微信云托管） | `wx.cloud.callContainer({ config: { env: '...' }, path: '/xxx', header: { 'X-WX-SERVICE': '<服务名>' } })` | 容器内 gunicorn 监听 `80` 端口（见 `src/server/Dockerfile`），服务名由云托管控制台分配 |

小程序端封装见 `src/miniapp/utils/api.js`：`USE_LOCAL` 为 `true` 时走 `wx.request` 直连本地，为 `false` 时走 `wx.cloud.callContainer`。

```js
// 生产调用示例
wx.cloud.callContainer({
  config: { env: 'prod-d7gbnxjit907040e0' },
  path: '/health',
  method: 'GET',
  header: { 'X-WX-SERVICE': 'flask-ga47', 'content-type': 'application/json' }
})
```

<a id="sec-request"></a>

### 1.2 请求约定

- **请求体**：`POST` 接口统一使用 JSON（`Content-Type: application/json`），服务端用 `request.get_json(silent=True)` 解析；解析失败时按“空对象”处理，因此缺少必填字段通常返回 `code: 1` 的参数错误，而不是 500。
- **查询参数**：`GET` 接口统一从 query string 读取（`request.args.get()`）。
- **响应体**：始终为 JSON，唯一的例外是 [`POST /wx_callback`](#sec-wx-callback)（返回纯文本 `success`）。
- 所有金额、比例、换算结果在响应中**以字符串返回**，避免浮点精度问题（如 `"monthly_payment": "4434.65"`）。
- 日期格式：`YYYY-MM-DD`；月份格式：`YYYY-MM`。

<a id="sec-envelope"></a>

### 1.3 统一响应结构

由 `common.py` 的 `ok()` / `fail()` 生成，所有接口（除 `POST /wx_callback`）都遵循此结构。

**成功**（HTTP 200）：

```json
{ "code": 0, "data": { }, "message": "ok" }
```

**失败**（HTTP 4xx / 5xx）：

```json
{ "code": 1, "data": null, "message": "错误原因" }
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | int | `0` 表示成功；非 0 表示失败，具体取值见[第 2 节](#sec-errors) |
| `data` | object / array / null | 业务数据；失败时固定为 `null` |
| `message` | string | 提示文案，成功时默认 `"ok"`，部分接口会返回更友好的中文提示 |

> **例外**：[`GET /history/today`](#sec-history-today) 在“该日期无数据”时返回 **HTTP 200 + `code: 2`**（`common.fail(..., code=2, http_status=200)`），用于把“没有数据”与“请求失败”区分开。客户端需要同时判断 `code` 与 HTTP 状态码。

**统一异常兜底**（`app.py`）：

- 未匹配到路由 → HTTP 404，`{"code": 404, "data": null, "message": "接口不存在"}`
- 未捕获异常 → HTTP 500，`{"code": 500, "data": null, "message": "服务器内部错误：..."}`

保证任何情况下都返回 JSON，而不是 Flask 默认的 HTML 错误页。

<a id="sec-openid"></a>

### 1.4 用户身份：`X-WX-OPENID`

- 微信云托管会在转发请求时**自动注入 `X-WX-OPENID` 请求头**，服务端无需自行换取 openid。
- `common.openid()` 的实现即 `request.headers.get('X-WX-OPENID', 'anonymous')`。
- **本地联调**不带该请求头时，所有请求都被视为同一个用户 `anonymous`。
- 少数接口允许在请求体中显式传 `openid` 覆盖请求头（目前仅 [`POST /feedback/submit`](#sec-feedback-submit)）。

<a id="sec-cors"></a>

### 1.5 跨域（CORS）

微信开发者工具基于 Chromium，`wx.request` 直连本地服务时受 CORS 限制，因此 `app.py` 做了全局处理：

- `@app.after_request` 为**所有响应**追加：

  | 响应头 | 值 |
  | --- | --- |
  | `Access-Control-Allow-Origin` | `*` |
  | `Access-Control-Allow-Methods` | `GET, POST, PUT, DELETE, OPTIONS` |
  | `Access-Control-Allow-Headers` | `Content-Type, Authorization` |

- `@app.before_request` 拦截 **OPTIONS 预检请求**，直接返回带上述响应头的空响应，不会进入业务逻辑。

---

<a id="sec-errors"></a>

## 2. 错误码与 HTTP 状态码

### 业务码 `code`

| code | 含义 | 出现场景 |
| --- | --- | --- |
| `0` | 成功 | 所有正常响应 |
| `1` | 通用失败 | 参数缺失/非法、校验不通过、数据库或第三方调用异常（`common.fail()` 默认值） |
| `2` | 业务“无数据” | **仅** [`GET /history/today`](#sec-history-today)，且伴随 HTTP 200 |
| `404` | 路由不存在 | `app.py` 的 404 处理器 |
| `500` | 服务器内部错误 | 全局异常处理器；OCR / 翻译的 SDK 调用失败 |
| `503` | 依赖未就绪 | Pillow 未安装（头像/表情包渲染）、腾讯云密钥未配置或服务未开通 |

### HTTP 状态码

| 状态码 | 含义 | 出现场景 |
| --- | --- | --- |
| `200` | 成功 | 正常响应；也包括 `/history/today` 的 `code: 2` |
| `400` | 请求错误 | `common.fail()` 默认状态码：参数校验失败、业务失败 |
| `404` | 未找到 | 访问了未注册的路径 |
| `500` | 服务器错误 | 未捕获异常、OCR/翻译 SDK 调用异常 |
| `503` | 服务不可用 | 可选依赖缺失（Pillow）、腾讯云密钥未配置、腾讯云服务未开通 |

---

<a id="sec-index"></a>

## 3. 接口总览

`MySQL` 列表示该接口需要已配置的 MySQL；`外部依赖` 列表示需要第三方密钥或可选 Python 包。

| # | 方法 | 路径 | 用途 | MySQL | 外部依赖 |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | [`/`](#sec-index-root) | 根路径健康检查 | — | — |
| 2 | GET | [`/health`](#sec-health) | 存活探针 | — | — |
| 3 | POST | [`/calculate_days`](#sec-calculate-days) | 计算两个日期相差天数 | — | — |
| 4 | POST | [`/unit/convert`](#sec-unit-convert) | 单位换算 | — | — |
| 5 | POST | [`/base/convert`](#sec-base-convert) | 进制转换（2~36） | — | — |
| 6 | POST | [`/mortgage/calc`](#sec-mortgage-calc) | 房贷计算（等额本息/本金） | — | — |
| 7 | POST | [`/tax/calc`](#sec-tax-calc) | 个税计算（累计预扣预缴） | — | — |
| 8 | POST | [`/account/add`](#sec-account-add) | 新增一笔账单 | ✅ | — |
| 9 | GET | [`/account/list`](#sec-account-list) | 账单分页查询 | ✅ | — |
| 10 | POST | [`/account/delete`](#sec-account-delete) | 删除账单 | ✅ | — |
| 11 | GET | [`/account/summary`](#sec-account-summary) | 收支统计 | ✅ | — |
| 12 | GET | [`/todo/list`](#sec-todo-list) | 待办列表 | ✅ | — |
| 13 | POST | [`/todo/add`](#sec-todo-add) | 新增待办 | ✅ | — |
| 14 | POST | [`/todo/update`](#sec-todo-update) | 更新待办 | ✅ | — |
| 15 | POST | [`/todo/delete`](#sec-todo-delete) | 删除待办 | ✅ | — |
| 16 | POST | [`/habit/add`](#sec-habit-add) | 创建习惯 | ✅ | — |
| 17 | GET | [`/habit/list`](#sec-habit-list) | 习惯列表 + 今日次数 | ✅ | — |
| 18 | POST | [`/habit/checkin`](#sec-habit-checkin) | 打卡 | ✅ | — |
| 19 | POST | [`/habit/reset`](#sec-habit-reset) | 清空某习惯打卡记录 | ✅ | — |
| 20 | GET | [`/habit/stats`](#sec-habit-stats) | 连续天数 + 记录明细 | ✅ | — |
| 21 | GET | [`/habit/history`](#sec-habit-history) | 月度打卡日历数据 | ✅ | — |
| 22 | GET | [`/habit/day`](#sec-habit-day) | 某日打卡详情 | ✅ | — |
| 23 | GET | [`/notify/settings`](#sec-notify-settings-get) | 读取通知设置 | ✅ | — |
| 24 | POST | [`/notify/settings`](#sec-notify-settings-post) | 保存通知设置 | ✅ | — |
| 25 | GET | [`/notify/check-drink`](#sec-notify-check-drink) | 判断是否需要喝水提醒 | ✅ | — |
| 26 | POST | [`/idcard/parse`](#sec-idcard-parse) | 身份证解析 | — | — |
| 27 | POST | [`/ocr/recognize`](#sec-ocr-recognize) | 通用文字识别 OCR | — | 腾讯云密钥 + SDK |
| 28 | POST | [`/tmt/translate`](#sec-tmt-translate) | 文本翻译 | — | 腾讯云密钥 + SDK |
| 29 | GET | [`/avatar/fonts`](#sec-avatar-fonts) | 可用字体列表 | — | — |
| 30 | GET | [`/avatar/templates`](#sec-avatar-templates) | 壁纸模板列表 | — | — |
| 31 | POST | [`/avatar/render`](#sec-avatar-render) | 生成壁纸/头像 | — | Pillow |
| 32 | POST | [`/meme/render`](#sec-meme-render) | 生成表情包 | — | Pillow |
| 33 | GET | [`/horoscope/daily`](#sec-horoscope-daily) | 星座日运 | — | — |
| 34 | POST | [`/random/coin`](#sec-random-coin) | 抛硬币 | — | — |
| 35 | POST | [`/random/spin`](#sec-random-spin) | 转盘抽选 | — | — |
| 36 | POST | [`/random/lottery`](#sec-random-lottery) | 抽签（多选不重复） | — | — |
| 37 | POST | [`/random/import`](#sec-random-import) | 从 Excel/Word 导入选项 | — | openpyxl / python-docx |
| 38 | POST | [`/minesweeper/new`](#sec-minesweeper-new) | 生成扫雷棋盘 | — | — |
| 39 | POST | [`/snake/score`](#sec-snake-score) | 提交贪吃蛇分数 | ✅ | — |
| 40 | GET | [`/snake/leaderboard`](#sec-snake-leaderboard) | 贪吃蛇排行榜 | ✅ | — |
| 41 | GET | [`/history/today`](#sec-history-today) | 历史上的今天 | — | — |
| 42 | POST | [`/feedback/submit`](#sec-feedback-submit) | 提交反馈 | ✅ | — |
| 43 | GET | [`/feedback/list`](#sec-feedback-list) | 反馈列表（管理端） | ✅ | — |
| 44 | POST | [`/feedback/webhook/config`](#sec-feedback-webhook-config) | 配置开发者通知 webhook | ✅ | — |
| 45 | POST | [`/feedback/webhook/test`](#sec-feedback-webhook-test) | 测试 webhook | ✅ | 外网出站 |
| 46 | GET | [`/feedback/webhook/status`](#sec-feedback-webhook-status) | 查询 webhook 状态 | ✅ | — |
| 47 | POST | [`/wx_callback`](#sec-wx-callback) | 微信云托管消息回调 | — | — |

---

<a id="sec-basic"></a>

## 4. 基础 / 健康检查

<a id="sec-index-root"></a>

### `GET /`

服务存活检查，用于确认部署成功。

- 参数：无
- 响应 `data`：

```json
{ "service": "miniapp-tools", "status": "running", "message": "工具箱后端服务运行中" }
```

<a id="sec-health"></a>

### `GET /health`

轻量存活探针，适合云托管健康检查。

- 参数：无
- 响应 `data`：`{ "status": "ok" }`

<a id="sec-calculate-days"></a>

### `POST /calculate_days`

计算两个日期之间相差的天数（取绝对值，与先后顺序无关）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `start_date` | string | ✅ | — | 起始日期，格式 `YYYY-MM-DD` |
| `end_date` | string | ✅ | — | 结束日期，格式 `YYYY-MM-DD` |

- 响应 `data`：`{ "days": 365 }`
- 响应 `message`：`已过去 365 天`
- 日期格式不合法时返回 `code: 1`，`message` 形如 `计算失败：...`

```json
// 请求
{ "start_date": "2024-01-01", "end_date": "2024-12-31" }
// 响应
{ "code": 0, "data": { "days": 365 }, "message": "已过去 365 天" }
```

---

<a id="sec-convert"></a>

## 5. 日期与换算

<a id="sec-unit-convert"></a>

### `POST /unit/convert`

单位换算，支持长度、重量、存储、温度四类。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `category` | string | ✅ | — | 类别：`length` / `weight` / `storage` / `temperature` |
| `value` | number / string | ✅ | — | 待换算的数值 |
| `from` | string | ✅ | — | 源单位，必须属于该 `category` |
| `to` | string | ✅ | — | 目标单位，必须属于该 `category` |

各 `category` 支持的单位：

| category | 单位 |
| --- | --- |
| `length` | `米`、`千米`、`厘米`、`毫米`、`英里`、`英尺`、`英寸` |
| `weight` | `千克`、`克`、`吨`、`斤`、`磅` |
| `storage` | `B`、`KB`、`MB`、`GB`、`TB`（按 1024 进制） |
| `temperature` | `摄氏度`、`华氏度`、`开尔文` |

- 响应 `data`：`{ "result": "3.28084", "unit": "英尺" }`（`result` 为字符串，已去掉多余尾随零）
- 单位不属于该类别时返回 `code: 1`，`message: "不支持的单位"`

<a id="sec-base-convert"></a>

### `POST /base/convert`

2~36 进制任意互转，同时返回常用进制结果。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | string / number | ✅ | — | 待转换的数值，支持 `-` 前缀表示负数 |
| `from_base` | int | ✅ | — | 源进制，取值 `2`~`36` |
| `to_base` | int | 否 | `10` | 目标进制，取值 `2`~`36` |

- 响应 `data`：

```json
{
  "result": "FF",
  "decimal": "255",
  "binary": "11111111",
  "octal": "377",
  "hex": "FF"
}
```

- 全部字段均为字符串；超过 `36` 进制范围返回 `code: 1`，`message: "进制范围应为 2~36"`
- 数值为空返回 `message: "请输入数值"`；出现超出该进制的字符返回 `message: "非法输入：字符 X 超出 N 进制范围"`

---

<a id="sec-calc"></a>

## 6. 计算器

<a id="sec-mortgage-calc"></a>

### `POST /mortgage/calc`

房贷计算器，支持等额本息与等额本金，并返回逐月还款明细。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `principal` | number / string | ✅ | — | 贷款本金（元），必须大于 0 |
| `years` | int | ✅ | — | 贷款年限，取值范围 `1`~`50` |
| `annual_rate` | number / string | 否 | `3.5` | 年利率（百分数，如 `3.5` 表示 3.5%）；传空值时回退到默认 LPR |
| `method` | string | 否 | `equal_payment` | `equal_payment` = 等额本息；其他任何值均按等额本金（`equal_principal`）处理 |

- 响应 `data`：

```json
{
  "monthly_payment": "4434.65",
  "total_interest": "596158.00",
  "total_payment": "1596158.00",
  "months": 360,
  "schedule": [
    { "month": 1, "payment": "4434.65", "principal": "1526.32", "interest": "2908.33", "balance": "998473.68" }
  ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `monthly_payment` | string | 等额本息为每月固定月供；等额本金为**首月**月供 |
| `total_interest` | string | 利息总额 |
| `total_payment` | string | 本息合计 |
| `months` | int | 总期数（`years × 12`） |
| `schedule` | array | 逐月明细，每项含 `month` / `payment` / `principal` / `interest` / `balance`，均为字符串 |

- 参数不合法（`years ≤ 0`、`years > 50`、`principal ≤ 0`）返回 `message: "贷款参数不合法"`
- 金额统一四舍五入到分（`ROUND_HALF_UP`）

<a id="sec-tax-calc"></a>

### `POST /tax/calc`

个税计算器（居民综合所得，按累计预扣预缴口径估算）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `monthly_income` | number / string | ✅ | — | 税前月收入（元） |
| `social_insurance` | number / string | 否 | `0` | 每月社保公积金个人缴纳额（元） |
| `special_deduction` | number / string | 否 | `0` | 每月专项附加扣除合计（元） |
| `months` | int | 否 | `12` | 计税月份数 |
| `annual_bonus` | number / string | 否 | `0` | 年终奖（元），按单独计税方式估算 |

- 响应 `data`：

```json
{
  "taxable_income": "60000.00",
  "tax": "3480.00",
  "tax_rate": "0.10",
  "take_home": "8710.00",
  "annual_bonus_tax": "0.00"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `taxable_income` | string | 累计应纳税所得额（`累计收入 - (5000 + 社保 + 专项附加) × 月数`） |
| `tax` | string | 累计应纳税额 |
| `tax_rate` | string | 适用税率（小数形式，如 `0.10`） |
| `take_home` | string | 月到手估算（`月收入 - 社保 - 累计税额 / 月数`） |
| `annual_bonus_tax` | string | 年终奖单独计税税额，`annual_bonus` 为 0 时返回 `"0.00"` |

- 税率表：3% / 10% / 20% / 25% / 30% / 35% / 45%，基本减除费用 `5000` 元/月
- 源码内另附专项附加扣除参考标准（子女教育、婴幼儿照护、赡养老人、住房贷款、住房租金、继续教育），**未参与计算**，仅作前端展示参考

---

<a id="sec-life"></a>

## 7. 生活工具

> 本章接口全部依赖 MySQL，数据按 `openid` 隔离，写入后会触发过期数据清理。详见[第 11 节](#sec-mysql)。

<a id="sec-account"></a>

### 7.1 记账本 `/account/*`

<a id="sec-account-add"></a>

#### `POST /account/add`

新增一笔账单。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `amount` | number | ✅ | — | 金额，必须大于 0 |
| `type` | int | 否 | `2` | `1` = 收入，`2` = 支出 |
| `category` | string | 否 | `其他` | 分类名称 |
| `note` | string | 否 | `""` | 备注，最长 255 |
| `date` | string | ✅ | — | 账单日期 `YYYY-MM-DD`（代码未设默认值，缺失会报错） |

- 响应 `data`：`{ "id": 12 }`
- 金额 ≤ 0 返回 `message: "金额必须大于 0"`

<a id="sec-account-list"></a>

#### `GET /account/list`

分页查询当前用户的账单。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `start` | string | 否 | 保留期起始日 | 起始日期 `YYYY-MM-DD`；早于保留期时会被自动提升到保留期起始日 |
| `end` | string | 否 | — | 结束日期 `YYYY-MM-DD`，不传则不限制上限 |
| `page` | int | 否 | `1` | 页码，最小 1 |
| `size` | int | 否 | `20` | 每页条数，范围 `1`~`100` |

- 响应 `data`：

```json
{
  "total": 36,
  "page": 1,
  "items": [
    { "id": 36, "amount": 25.5, "type": 2, "category": "餐饮", "note": "午饭", "date": "2024-06-01" }
  ]
}
```

- 排序：`date DESC, id DESC`

<a id="sec-account-delete"></a>

#### `POST /account/delete`

删除一条账单（仅能删除自己的记录）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | ✅ | — | 账单 ID |

- 响应 `data`：`{ "deleted": true }`

<a id="sec-account-summary"></a>

#### `GET /account/summary`

统计收入、支出与分类汇总。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `month` | string | 否 | — | 指定月份 `YYYY-MM`；不传则统计保留期内全部数据 |

- 响应 `data`：

```json
{
  "income": 8000.0,
  "expense": 3210.5,
  "balance": 4789.5,
  "by_category": [ { "category": "餐饮", "type": 2, "total": 1200.0 } ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `income` | number | 收入合计（`type = 1`） |
| `expense` | number | 支出合计（`type = 2`） |
| `balance` | number | 结余 = `income - expense` |
| `by_category` | array | 按 `category` + `type` 分组的合计，`total` 为金额 |

<a id="sec-todo"></a>

### 7.2 待办清单 `/todo/*`

<a id="sec-todo-list"></a>

#### `GET /todo/list`

获取当前用户保留期内的待办列表。

- 参数：无
- 响应 `data`：

```json
{
  "items": [
    { "id": 3, "title": "写周报", "done": 0, "priority": 2, "created_at": "2024-06-01 10:00:00" }
  ]
}
```

- 排序：未完成优先（`done ASC`），其次优先级降序（`priority DESC`），最后按 `id DESC`

<a id="sec-todo-add"></a>

#### `POST /todo/add`

新增待办。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | string | ✅ | — | 待办内容，去除首尾空格后不能为空 |
| `priority` | int | 否 | `0` | 优先级，数值越大越靠前 |

- 响应 `data`：`{ "id": 9 }`
- 内容为空返回 `message: "待办内容不能为空"`

<a id="sec-todo-update"></a>

#### `POST /todo/update`

更新待办，按字段局部更新（只处理请求体中出现的键）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | ✅ | — | 待办 ID |
| `done` | bool | 否 | — | 传入即更新完成状态（真值 → `1`，假值 → `0`） |
| `title` | string | 否 | — | 传入且非空时更新标题 |
| `priority` | int | 否 | — | 传入即更新优先级 |

- 响应 `data`：`{ "updated": true }`

<a id="sec-todo-delete"></a>

#### `POST /todo/delete`

删除待办。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | int | ✅ | — | 待办 ID |

- 响应 `data`：`{ "deleted": true }`

<a id="sec-habit"></a>

### 7.3 习惯打卡 `/habit/*`

<a id="sec-habit-add"></a>

#### `POST /habit/add`

创建一个习惯（如“喝水”）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | string | ✅ | — | 习惯名称，不能为空 |
| `icon` | string | 否 | `💧` | 图标（emoji） |
| `target` | int | 否 | `1` | 每日目标次数 |

- 响应 `data`：`{ "id": 5 }`

<a id="sec-habit-list"></a>

#### `GET /habit/list`

习惯列表，附带今日已打卡次数。

- 参数：无
- 响应 `data`：

```json
{
  "items": [ { "id": 5, "name": "喝水", "icon": "💧", "target": 8, "today_count": 3 } ]
}
```

- 排序：`id DESC`

<a id="sec-habit-checkin"></a>

#### `POST /habit/checkin`

打卡一次（同一天重复打卡会累加次数）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `habit_id` | int | ✅ | — | 习惯 ID |

- 响应 `data`：`{ "today_count": 4, "streak": 7 }`
  - `today_count`：今日累计打卡次数
  - `streak`：连续打卡天数（今日未打卡时从昨天开始回溯）
- 打卡后自动清理该习惯超过 60 天的记录

<a id="sec-habit-reset"></a>

#### `POST /habit/reset`

清空某个习惯的全部打卡记录，从零开始。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `habit_id` | int | ✅ | — | 习惯 ID，为 0 或缺失时返回错误 |

- 响应 `data`：`{}`，`message: "打卡记录已清空"`
- 缺失 `habit_id` 返回 `message: "请提供 habit_id"`

<a id="sec-habit-stats"></a>

#### `GET /habit/stats`

查询连续天数与保留期内的打卡明细。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `habit_id` | int | ✅ | — | 习惯 ID |

- 响应 `data`：

```json
{
  "streak": 7,
  "logs": [ { "date": "2024-06-01", "count": 3 } ]
}
```

- `logs` 按 `date` 升序，仅包含保留期内的记录

<a id="sec-habit-history"></a>

#### `GET /habit/history`

获取指定月份的打卡记录，用于日历展示。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `habit_id` | int | ✅ | — | 习惯 ID |
| `month` | string | 否 | 当前月 | 月份 `YYYY-MM` |

- 响应 `data`：

```json
{
  "month": "2024-06",
  "logs": { "2024-06-01": 3, "2024-06-02": 1 }
}
```

- `logs` 为 `{ 日期: 次数 }` 字典，仅包含有打卡记录的日期

<a id="sec-habit-day"></a>

#### `GET /habit/day`

查询某一天的打卡详情。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `habit_id` | int | ✅ | — | 习惯 ID |
| `date` | string | ✅ | — | 日期 `YYYY-MM-DD`，缺失时返回 `message: "请提供日期"` |

- 响应 `data`（有记录时）：

```json
{ "date": "2024-06-01", "count": 3, "created_at": "2024-06-01 09:12:00" }
```

- 无记录时返回 `code: 0`，`data` 为 `{ "date": "2024-06-01", "count": 0, "created_at": null }`

<a id="sec-notify"></a>

### 7.4 通知设置 `/notify/*`

<a id="sec-notify-settings-get"></a>

#### `GET /notify/settings`

读取当前用户的通知设置；从未保存过时返回默认值（全部开启）。

- 参数：无
- 响应 `data`：`{ "enabled": true, "drink_reminder": true }`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `enabled` | bool | 总开关 |
| `drink_reminder` | bool | 喝水提醒开关 |

<a id="sec-notify-settings-post"></a>

#### `POST /notify/settings`

保存通知设置（存在则更新，不存在则插入）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `enabled` | bool | 否 | `true` | 总开关 |
| `drink_reminder` | bool | 否 | `true` | 喝水提醒开关 |

- 响应 `data`：`{ "enabled": true, "drink_reminder": true }`，`message: "保存成功"`

<a id="sec-notify-check-drink"></a>

#### `GET /notify/check-drink`

判断“现在是否需要弹出喝水提醒”。判定顺序（任一不满足即返回 `need_remind: false`）：

1. 通知总开关或喝水提醒开关关闭 → `reason: "通知已关闭"`
2. 当前时间早于 12:00 → `reason: "尚未到中午"`
3. 当前用户没有名为 `喝水` 的习惯 → `reason: "未创建喝水习惯"`
4. 今天已打卡 → `reason: "今日已打卡"`，并附带 `today_count`

- 参数：无
- 响应 `data`：

```json
{ "need_remind": true, "reason": "今日尚未打卡", "today_count": 0 }
```

---

<a id="sec-media"></a>

## 8. 文本与图像

<a id="sec-idcard-parse"></a>

### `POST /idcard/parse`

解析 18 位身份证号：校验位验证 + 归属地/生日/年龄/性别/生肖/星座提取。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `id_number` | string | ✅ | — | 18 位身份证号，末位可为 `X`（大小写均可） |

- 响应 `data`：

```json
{
  "valid": true,
  "province": "广东省",
  "birthday": "1995-08-16",
  "age": 29,
  "gender": "男",
  "zodiac": "猪",
  "constellation": "狮子座"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `valid` | bool | 校验位是否符合 GB 11643-1999（不通过时仍返回其余解析结果） |
| `province` | string | 前 2 位对应省份，未知时返回 `未知` |
| `birthday` | string | `YYYY-MM-DD` |
| `age` | int | 按天数除以 365 估算 |
| `gender` | string | `男` / `女`（第 17 位奇偶判定） |
| `zodiac` | string | 生肖 |
| `constellation` | string | 星座 |

- 格式不符返回 `message: "身份证号码应为 18 位数字或末位 X"`
- 生日不合法返回 `message: "身份证中的出生日期不合法"`

> 说明：该接口为纯本地计算，不会把身份证号落库或转发到第三方。

<a id="sec-ocr-recognize"></a>

### `POST /ocr/recognize`

腾讯云通用文字识别（`GeneralBasicOCR`）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `image_base64` | string | ✅ | — | 图片 base64；可带 `data:image/jpeg;base64,` 前缀，服务端会自动去除 |

- 响应 `data`：

```json
{ "full_text": "第一行\n第二行", "lines": ["第一行", "第二行"] }
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `full_text` | string | 所有识别行以 `\n` 拼接 |
| `lines` | array | 逐行识别结果 |

- 未识别到文字时返回 `code: 0`，`data` 为 `{ "full_text": "", "lines": [] }`，`message: "未识别到文字，请确认图片中包含清晰文字"`
- 缺少图片 → `message: "缺少图片数据，请重新拍照或选择图片"`
- base64 长度超过约 7MB → `message: "图片过大，请使用压缩后的图片（建议控制在 7MB 以内）"`
- 调用区域固定为 `ap-guangzhou`

> **依赖要求**：需要安装 `tencentcloud-sdk-python`（`requirements.txt` 已包含 `tencentcloud-sdk-python-common/ocr/tmt`），并配置环境变量 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`。**任一缺失时该接口返回 HTTP 503 + 可读提示**（`未安装 tencentcloud-sdk-python...` 或 `未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 环境变量`），其余接口不受影响。SDK 为可选导入，缺失时服务仍能正常启动。腾讯云侧未开通服务时同样返回 503。

<a id="sec-tmt-translate"></a>

### `POST /tmt/translate`

腾讯云机器翻译（`TextTranslate`）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | string | ✅ | — | 待翻译文本，去除首尾空格后不能为空，单次不超过 5000 字符 |
| `source` | string | 否 | `auto` | 源语言代码，如 `auto` / `zh` / `en` |
| `target` | string | 否 | `en` | 目标语言代码 |

- 响应 `data`：`{ "result": "Hello", "source": "auto", "target": "en" }`
- 文本为空返回 `message: "翻译文本不能为空"`；超长返回 `message: "单次翻译文本不能超过 5000 字符"`
- 服务端对 `(text, source, target)` 做了进程内缓存（最多 512 条），相同请求会直接命中缓存
- 与 OCR 相同：SDK 或密钥缺失、腾讯云侧服务未开通时返回 **HTTP 503**；SDK 调用异常返回 HTTP 500

<a id="sec-avatar-fonts"></a>

### `GET /avatar/fonts`

返回服务器上**实际可用**的字体家族（按字体文件是否存在逐个探测）。

- 参数：无
- 响应 `data`：

```json
{ "fonts": [ { "id": "songti", "name": "宋体" }, { "id": "heiti", "name": "黑体" } ] }
```

- 可选家族 ID：`songti`（宋体）、`heiti`（黑体）、`kaiti`（楷体）、`yuanti`（圆体）、`times`（Times New Roman）

<a id="sec-avatar-templates"></a>

### `GET /avatar/templates`

返回内置壁纸模板。

- 参数：无
- 响应 `data`：

```json
{
  "templates": [
    { "id": "dawn", "colors": ["#f7971e", "#ffd200"], "quote": "向阳而生" }
  ]
}
```

- 模板 ID：`dawn`、`ocean`、`forest`、`night`、`rose`、`sunset`

<a id="sec-avatar-render"></a>

### `POST /avatar/render`

服务端用 Pillow 渲染渐变壁纸/头像，返回 base64 PNG。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `width` | int | 否 | `750` | 宽度，限制在 `100`~`2000` |
| `height` | int | 否 | `1334` | 高度，限制在 `100`~`3000` |
| `template` | string | 否 | `dawn` | 模板 ID，未知 ID 回退到 `dawn` |
| `colors` | string[] | 否 | 模板配色 | 渐变色数组（十六进制），取前两个；只传一个时两色相同 |
| `font` | string | 否 | `songti` | 字体家族 ID，见 `/avatar/fonts` |
| `quote` | string | 否 | 模板文案 | 自定义文案；为空或全空格时使用模板默认文案；支持 `\n` 换行 |

- 响应 `data`：`{ "image": "data:image/png;base64,..." }`
- 文案会按画布宽度自动换行、自动缩小字号（下限 16px）并垂直居中，带阴影保证可读性
- 未安装 Pillow 时返回 **HTTP 503** + `message: "未安装 Pillow，请先安装依赖"`

<a id="sec-meme-render"></a>

### `POST /meme/render`

生成微信个人表情包：居中裁剪为 240×240 并叠加上下文字，返回 base64 GIF。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `image_base64` | string | 二选一 | — | 图片 base64（可带 data URL 前缀） |
| `image_url` | string | 二选一 | — | 图片地址，服务端下载（超时 8 秒） |
| `top_text` | string | 否 | — | 顶部文字 |
| `bottom_text` | string | 否 | — | 底部文字 |

- 响应 `data`：`{ "image": "data:image/gif;base64,..." }`
- 两者都不传时返回 `message: "生成失败：缺少图片数据"`
- 未安装 Pillow 时返回 **HTTP 503** + `message: "未安装 Pillow，请先安装依赖"`
- 会自动按 EXIF 方向纠正（`ImageOps.exif_transpose`）

---

<a id="sec-fun"></a>

## 9. 娱乐

<a id="sec-horoscope-daily"></a>

### `GET /horoscope/daily`

星座日运。同一“星座 + 日期”组合结果**确定性稳定**（以 `md5(sign:date)` 作为随机种子），不会每次刷新都变化。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `sign` | string | ✅ | — | 星座英文 ID（不区分大小写）：`aries`、`taurus`、`gemini`、`cancer`、`leo`、`virgo`、`libra`、`scorpio`、`sagittarius`、`capricorn`、`aquarius`、`pisces` |
| `date` | string | 否 | 今天 | 查询日期 `YYYY-MM-DD` |

- 响应 `data`：

```json
{
  "sign": "狮子座",
  "date": "2024-06-01",
  "overall": 88, "love": 75, "career": 92, "wealth": 66, "health": 81,
  "lucky_color": "金色",
  "lucky_number": 7,
  "summary": "能量充沛的一天，适合主动出击、拓展人际。",
  "love_text": "桃花运不错，单身者有机会遇到聊得来的人。",
  "career_text": "工作中易获认可，适合展示成果。",
  "wealth_text": "偏财运平平，理性消费为上。",
  "health_text": "状态良好，注意用眼与久坐。"
}
```

- 五项评分均为 `60`~`99` 的整数；`lucky_number` 为 `1`~`9`
- 星座 ID 无法识别时返回 `code: 1`，`message: "未知星座"`

<a id="sec-random-coin"></a>

### `POST /random/coin`

抛硬币（使用 `secrets` 加密级随机源）。

- 参数：无（请求体可为空）
- 响应 `data`：`{ "value": 0, "result": "正面" }`（`value` 为 `0` 时是正面，`1` 时是反面）

<a id="sec-random-spin"></a>

### `POST /random/spin`

转盘随机抽选一个选项。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | array | ✅ | — | 选项数组，不能为空 |

- 响应 `data`：`{ "index": 2, "result": "选项C", "options": ["选项A", "选项B", "选项C"] }`
- 选项为空返回 `message: "请提供选项"`

<a id="sec-random-lottery"></a>

### `POST /random/lottery`

抽签：从选项中随机抽取 `count` 个**不重复**的结果。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | array | ✅ | — | 选项数组 |
| `count` | int | 否 | `1` | 抽取数量，需 `≥ 1` 且不超过选项总数 |

- 响应 `data`：`{ "results": ["选项A", "选项D"] }`
- 参数不合法返回 `message: "参数不合法"`；`count` 大于选项数返回 `message: "抽签数量超过选项数量"`

<a id="sec-random-import"></a>

### `POST /random/import`

解析前端上传的 Excel / Word（base64），提取选项列表。适合批量导入抽签名单。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `fileData` | string | ✅ | — | 文件 base64（也兼容 `file_data` 命名） |
| `fileName` | string | 否 | `unknown` | 文件名，用于判断扩展名（也兼容 `file_name`） |

- 支持扩展名：`xlsx`、`xls`、`docx`、`doc`（其他类型直接拒绝）
- 文件大小上限 **5MB**（按解码后的字节数判断）
- 解析规则：
  - Excel：遍历所有 sheet 的**第一列**非空单元格
  - Word：遍历所有非空段落
  - 单元格/段落文本先按换行、再按英文逗号 `,` 与中文逗号 `，` 切分，结果去重
- 响应 `data`：

```json
{ "options": ["张三", "李四"], "count": 2, "fileName": "名单.xlsx" }
```

- 常见错误 `message`：`未收到文件内容`、`不支持的文件类型 .pdf，请上传 Excel (.xlsx/.xls) 或 Word (.docx/.doc) 文档`、`文件内容解码失败，请重新选择文件`、`文件大小超过 5MB 限制`、`文档中未找到有效选项，请确保内容用逗号或换行分隔`
- 若服务器缺少 `openpyxl` 或 `python-docx`，会返回 `服务器未安装 Excel 解析库` / `服务器未安装 Word 解析库`
- 解析用的临时文件会在请求结束时删除

<a id="sec-minesweeper-new"></a>

### `POST /minesweeper/new`

生成扫雷棋盘，保证**首点及其周围 8 格安全**（不会踩雷）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `rows` | int | 否 | `9` | 行数，限制在 `4`~`30` |
| `cols` | int | 否 | `9` | 列数，限制在 `4`~`30` |
| `mines` | int | 否 | `10` | 雷数，限制在 `1` ~ `rows × cols - 9` |
| `first_r` | int | 否 | `0` | 首次点击的行号 |
| `first_c` | int | 否 | `0` | 首次点击的列号 |

- 响应 `data`：

```json
{
  "rows": 9, "cols": 9, "mines": 10,
  "bombs": [ { "r": 0, "c": 3 }, { "r": 2, "c": 5 } ]
}
```

- 雷数超出可用格子时返回 `message: "地雷数量过多"`

<a id="sec-snake-score"></a>

### `POST /snake/score`

提交贪吃蛇分数并返回当前排名。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `score` | int | 否 | `0` | 分数，负数会被归零 |

- 响应 `data`：`{ "rank": 3 }`（`rank` = 保留期内严格高于本分数的记录数 + 1）
- 提交后会触发过期数据清理

<a id="sec-snake-leaderboard"></a>

### `GET /snake/leaderboard`

排行榜：保留期内每个用户的最高分，前 20 名。

- 参数：无
- 响应 `data`：

```json
{ "items": [ { "openid": "oXXXX...", "best": 120 } ] }
```

- 排序：`best DESC`，最多 20 条
- 返回的 `openid` 为微信用户标识，前端展示时建议做脱敏处理

<a id="sec-history-today"></a>

### `GET /history/today`

“历史上的今天”，数据来自服务端本地合规事件库 `src/server/data/history.json`。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `month` | int | 否 | 当前月 | 月份 `1`~`12` |
| `day` | int | 否 | 当前日 | 日期 `1`~`31` |

- 命中数据时响应 `data`：

```json
{
  "date": "06-01",
  "count": 2,
  "items": [
    { "year": 2006, "title": "中国全面取消农业税", "desc": "延续两千余年的农业税正式废止，亿万农民直接受益。", "category": "中国", "type": "政策" }
  ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `date` | string | 查询键，格式 `MM-DD` |
| `count` | int | 事件条数 |
| `items` | array | 事件列表，按 `year` 降序；每项含 `year` / `title` / `desc` / `category` / `type` |

- **无数据时返回 HTTP 200 + `code: 2`**，`data: null`，`message: "抱歉，此事件无法查询"`

> 注意：该接口是全文档中唯一使用 `code: 2` 的接口，客户端需要单独处理。

---

<a id="sec-feedback"></a>

## 10. 反馈与回调

<a id="sec-feedback-submit"></a>

### `POST /feedback/submit`

提交用户反馈，落库后可选地向开发者推送通知。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `content` | string | 建议 | `""` | 反馈内容；代码未做非空校验，但会做内容合规校验 |
| `openid` | string | 否 | 请求头 `X-WX-OPENID` | 显式指定用户标识，覆盖请求头 |

- 内容校验（任一命中即拒绝）：
  - **代码特征**：匹配 `function(`、`const x =`、`let x =`、`var x =`、`import ... from`、`require(`、`() => {`、HTML 标签、`console.log`、`document.`、`window.`、`{{ }}` 模板语法、`wx.xxx(` 等正则 → `message: "反馈内容不能包含代码"`
  - **内置敏感词表** → `message: "反馈内容包含不当用语"`
- 响应 `data`：`{ "id": 7, "message": "反馈已提交" }`
- 若已在 [`/feedback/webhook/config`](#sec-feedback-webhook-config) 配置 webhook，则同步推送一条通知；推送失败只打印日志，**不影响**提交结果

<a id="sec-feedback-list"></a>

### `GET /feedback/list`

反馈列表（**管理端接口**，源码注释标明“暂不对外开放”，未做鉴权，部署到公网时请自行加保护）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | int | 否 | `1` | 页码，最小 1 |
| `size` | int | 否 | `20` | 每页条数，范围 `1`~`100` |

- 响应 `data`：

```json
{
  "total": 12,
  "page": 1,
  "items": [ { "id": 7, "openid": "oXXXX...", "content": "希望增加深色模式", "status": 0, "created_at": "2024-06-01 10:00:00" } ]
}
```

- 注意：该接口**不按用户过滤**，返回所有用户的反馈，按 `created_at DESC` 排序

<a id="sec-feedback-webhook-config"></a>

### `POST /feedback/webhook/config`

配置开发者通知 webhook（持久化到 `settings` 表）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `webhook_url` | string | ✅ | — | 必须以 `http://` 或 `https://` 开头 |

- 响应 `data`：`{ "message": "webhook 配置已保存", "enabled": true }`
- 空值返回 `message: "请提供有效的 webhook URL"`；协议不符返回 `message: "webhook URL 必须以 http:// 或 https:// 开头"`
- 自动适配消息体：地址包含 `sctapi.ftqq.com`（Server 酱）时使用 `{title, desp}` 格式，否则使用 `{title, content, timestamp, ...}` 通用格式

> 安全提示：webhook 地址通常自带推送密钥，请只在服务端配置，不要写入仓库或文档。

<a id="sec-feedback-webhook-test"></a>

### `POST /feedback/webhook/test`

向已配置的 webhook 发送一条测试通知。

- 参数：无
- 响应 `data`：`{ "message": "测试通知发送成功" }`
- 未配置时返回 `message: "请先配置 webhook 地址"`
- 发送失败返回 `通知发送失败 (HTTP xxx): xxx` 或 `通知发送失败: xxx`（超时 5 秒）

<a id="sec-feedback-webhook-status"></a>

### `GET /feedback/webhook/status`

查询 webhook 配置状态。

- 参数：无
- 响应 `data`：`{ "enabled": true, "url": "<已配置的地址>" }`；未配置时 `enabled` 为 `false`，`url` 为空字符串

<a id="sec-wx-callback"></a>

### `POST /wx_callback`

微信云托管消息推送回调入口。云托管平台已完成鉴权，服务端**不做 Token 校验**。

- 参数：请求体可为 JSON，也可为原始文本（代码先尝试 `get_json()`，失败则按纯文本读取）
- 响应：**纯文本 `success`**（不是 JSON 信封），确保微信不会因非 200/非 success 而无限重试；内部处理异常时同样返回 `success`
- 收到的消息会打印到云托管日志（`[微信消息推送] 收到消息: ...`）

---

<a id="sec-mysql"></a>

## 11. 依赖 MySQL 的接口

以下接口需要已配置可用的 MySQL，未配置时连接失败，会返回 `code: 1` 与 `message`（形如 `查询失败：...`）：

| 模块 | 接口 |
| --- | --- |
| 记账本 | `/account/add`、`/account/list`、`/account/delete`、`/account/summary` |
| 待办 | `/todo/list`、`/todo/add`、`/todo/update`、`/todo/delete` |
| 习惯 | `/habit/add`、`/habit/list`、`/habit/checkin`、`/habit/reset`、`/habit/stats`、`/habit/history`、`/habit/day` |
| 通知 | `/notify/settings`（GET/POST）、`/notify/check-drink` |
| 贪吃蛇 | `/snake/score`、`/snake/leaderboard` |
| 反馈 | `/feedback/submit`、`/feedback/list`、`/feedback/webhook/*` |

**连接配置**（`db.py`，均为环境变量，仓库中不保存任何密码）：

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `MYSQL_ADDRESS` | 空 | 云托管注入的 `host:port`，**优先使用** |
| `MYSQL_HOST` | `127.0.0.1` | 未提供 `MYSQL_ADDRESS` 时使用 |
| `MYSQL_PORT` | `3306` | 同上 |
| `MYSQL_USERNAME` / `MYSQL_USER` | `root` | 数据库用户名 |
| `MYSQL_PASSWORD` | 空 | 数据库密码（只允许来自环境变量） |
| `MYSQL_DATABASE` / `MYSQL_DB` | `miniapp_tools` | 库名，不存在时自动 `CREATE DATABASE` |

**其他行为**：

- 首次连接会自动建库并执行 `CREATE TABLE IF NOT EXISTS` 建表（`bills`、`todos`、`habits`、`habit_logs`、`snake_scores`、`feedbacks`、`settings`、`notify_settings`）。
- **每请求一个连接**：连接保存在 Flask `g` 中，请求结束由 `teardown_appcontext(db.close_db)` 自动关闭。
- **用户隔离**：所有业务 SQL 都带 `openid = %s` 条件（`/feedback/list` 例外，为管理端全量查询），删除类接口也同时校验 `id + openid`，无法越权操作他人数据。
- **数据保留**：`db.RETENTION_DAYS = 60`（天）。记账、待办、打卡记录、分数、反馈在写入或读取关键路径上会触发清理；习惯打卡另有独立的 60 天清理逻辑。
  > 注：部分模块注释写作“30 天”，以代码常量 `RETENTION_DAYS = 60` 为准。
- **类型转换**：`DECIMAL` 转 `float`、`DATE/DATETIME` 转字符串，保证 `jsonify` 可序列化。

---

<a id="sec-tencent"></a>

## 12. 依赖腾讯云密钥的接口

| 接口 | 依赖 | 未配置时的表现 |
| --- | --- | --- |
| `POST /ocr/recognize` | `TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`、`tencentcloud-sdk-python-ocr` | **HTTP 503** + 可读提示 |
| `POST /tmt/translate` | 同上（`tencentcloud-sdk-python-tmt`） | **HTTP 503** + 可读提示 |

具体提示文案：

- 未安装 SDK：`未安装 tencentcloud-sdk-python，请先在 requirements.txt 中添加该依赖并重新部署`
- 未配置密钥：`未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 环境变量`
- 腾讯云侧未开通服务：`OCR 服务未开通，请前往腾讯云控制台 → 文字识别 → 开通服务` / `机器翻译服务未开通，请前往腾讯云控制台 → 机器翻译 → 开通服务`（同样为 503）

设计要点：腾讯云 SDK 是**可选导入**（`try/except ImportError`），缺失时服务仍可正常启动，只有这两个接口不可用，其余功能不受影响。请勿把密钥写入代码或提交到仓库。

---

<a id="sec-appendix"></a>

## 13. 附录：环境变量与数据表

### 环境变量

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `PORT` | `3000` | 本地开发监听端口；云托管由 gunicorn 固定监听 `80` |
| `MYSQL_ADDRESS` | — | 云托管注入的 MySQL `host:port` |
| `MYSQL_HOST` / `MYSQL_PORT` | `127.0.0.1` / `3306` | 本地 MySQL 地址 |
| `MYSQL_USERNAME` / `MYSQL_USER` | `root` | MySQL 用户名 |
| `MYSQL_PASSWORD` | 空 | MySQL 密码 |
| `MYSQL_DATABASE` / `MYSQL_DB` | `miniapp_tools` | 数据库名 |
| `TENCENT_SECRET_ID` | 空 | 腾讯云 API 密钥 ID（OCR / 翻译） |
| `TENCENT_SECRET_KEY` | 空 | 腾讯云 API 密钥 Key（OCR / 翻译） |

模板见仓库根目录 `.env.example`（真实 `.env` 已被 `.gitignore` 忽略）。

### 数据表

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `bills` | 记账本 | `openid`、`amount`、`type`、`category`、`note`、`date` |
| `todos` | 待办清单 | `openid`、`title`、`done`、`priority` |
| `habits` | 习惯定义 | `openid`、`name`、`icon`、`target` |
| `habit_logs` | 打卡日志 | `openid`、`habit_id`、`date`、`count`（`openid + habit_id + date` 唯一） |
| `snake_scores` | 贪吃蛇分数 | `openid`、`score` |
| `feedbacks` | 用户反馈 | `openid`、`content`、`status` |
| `settings` | 系统键值配置 | `setting_key`、`setting_value`（如反馈 webhook 地址） |
| `notify_settings` | 通知设置 | `openid`（唯一）、`enabled`、`drink_reminder` |

### 源码模块索引

| 文件 | 负责内容 |
| --- | --- |
| `app.py` | 应用入口、CORS、健康检查、日期计算、蓝图注册、404/500 兜底 |
| `common.py` | 统一响应 `ok()` / `fail()`、`openid()` |
| `db.py` | MySQL 连接、建库建表、数据保留清理、查询辅助 |
| `account.py` / `todo.py` / `habit.py` / `notify.py` | 记账、待办、习惯打卡、通知设置 |
| `unit_convert.py` / `base_convert.py` / `mortgage.py` / `tax_calc.py` | 换算与计算器 |
| `id_card.py` / `ocr_translate.py` / `avatar_wallpaper.py` / `meme_generator.py` / `font_util.py` | 身份证解析、OCR 与翻译、图像生成与字体 |
| `horoscope.py` / `random_decide.py` / `minesweeper.py` / `snake.py` / `history_today.py` | 星座、随机决定、扫雷、贪吃蛇、历史上的今天 |
| `feedback.py` / `wx_callback.py` | 反馈与 webhook、微信消息回调 |
