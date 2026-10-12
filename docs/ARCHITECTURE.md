# 架构说明

本文说明这套「微信小程序工具箱」的整体结构、请求链路和几个关键设计取舍。

---

## 目录

- [总览](#总览)
- [请求链路](#请求链路)
- [后端分层](#后端分层)
- [数据模型](#数据模型)
- [数据保留策略](#数据保留策略)
- [前端结构](#前端结构)
- [关键设计取舍](#关键设计取舍)
- [模块对照表](#模块对照表)

---

## 总览

```
┌─────────────────────────────┐
│  微信小程序 src/miniapp      │
│  pages/*  ←→  utils/api.js  │
└──────────────┬──────────────┘
               │
      USE_LOCAL=true  │  USE_LOCAL=false
               │    │
   wx.request  │    │  wx.cloud.callContainer
   (127.0.0.1) │    │  header: X-WX-SERVICE
               ▼    ▼
      ┌──────────────────────────┐
      │  Flask  src/server        │
      │  app.py  ← 注册全部蓝图   │
      │  common.py  统一响应结构  │
      │  db.py     连接 / 建表    │
      └───────┬──────────┬───────┘
              │          │
              ▼          ▼
        ┌─────────┐  ┌──────────────────────┐
        │  MySQL  │  │ 腾讯云 OCR / 机器翻译 │
        └─────────┘  └──────────────────────┘
              ▲
              │ 由微信云托管自动注入
              │ MYSQL_ADDRESS / USERNAME / PASSWORD
```

部署形态是**微信云托管**：仓库根目录作为构建上下文，`src/server/Dockerfile` 打镜像，
容器内 `gunicorn` 监听 80 端口。

---

## 请求链路

### 1. 小程序侧

所有网络请求都收敛在 `src/miniapp/utils/api.js` 的一个 `request()` 函数里，
对外只暴露 `get()` / `post()`：

- `USE_LOCAL = true` → 走 `wx.request` 直连 `http://127.0.0.1:3000`，用于本地联调
- `USE_LOCAL = false` → 走 `wx.cloud.callContainer`，带上 `X-WX-SERVICE` 头访问云托管

两种模式对上层页面完全透明：拿到响应后统一判断 `body.code === 0`，
成功 `resolve(body.data)`，失败 `reject(new Error(body.message))`。
页面里因此不需要各自处理错误结构。

### 2. 云托管注入的身份

云托管会在转发请求时注入 `X-WX-OPENID` 请求头。后端 `common.openid()` 读取它：

```python
def openid():
    return request.headers.get('X-WX-OPENID', 'anonymous')
```

本地联调没有这个头，会退化成 `anonymous`，所以本地也能跑通全部流程。

### 3. 后端响应

`common.py` 定义唯一的响应信封：

| 场景 | HTTP | 响应体 |
| --- | --- | --- |
| 成功 | 200 | `{"code": 0, "data": ..., "message": "ok"}` |
| 失败 | 4xx / 5xx | `{"code": <非0>, "data": null, "message": "..."}` |

`app.py` 里注册了 404 与 500 的统一处理器，保证**任何异常都返回 JSON 而不是 HTML**——
否则小程序的 `res.data.code` 判断会直接崩掉。

### 4. CORS

微信开发者工具基于 Chromium，`wx.request` 受同源策略限制，所以 `app.py` 里：

- `after_request` 给所有响应补上 `Access-Control-Allow-Origin: *`
- `before_request` 拦截 `OPTIONS` 预检请求并直接返回

---

## 后端分层

```
app.py            入口：创建 Flask app、注册 CORS、注册统一错误处理、挂载全部蓝图
  │
  ├── common.py   统一响应结构 ok()/fail()，以及 openid()
  ├── db.py       MySQL 连接池（每请求一条）、自动建库建表、保留期清理
  │
  └── 各功能蓝图   account.py / todo.py / habit.py / mortgage.py / ...
```

每个功能是一个独立的 `Blueprint`，带自己的 `url_prefix`：

```python
mortgage_bp = Blueprint('mortgage', __name__, url_prefix='/mortgage')
```

`app.py` 结尾用一个 tuple 一次性注册：

```python
for bp in (mortgage_bp, tax_bp, unit_bp, ...):
    app.register_blueprint(bp)
```

**加一个新工具的成本**：写一个 `xxx.py` 暴露 `xxx_bp` → 在 `app.py` 里 import 并加进 tuple。
不需要改任何路由表或配置文件。

---

## 数据模型

`db.py` 的 `_SCHEMA` 里用 `CREATE TABLE IF NOT EXISTS` 声明了全部表，
**首次连接时自动创建**，不需要手动跑 migration：

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `bills` | 记账本 | `openid`, `amount`, `type`, `category`, `date` |
| `todos` | 待办清单 | `openid`, `title`, `done`, `priority` |
| `habits` | 习惯定义 | `openid`, `name`, `icon`, `target` |
| `habit_logs` | 打卡日志 | `openid`, `habit_id`, `date`, `count`（唯一键防重复打卡） |
| `snake_scores` | 贪吃蛇分数 | `openid`, `score` |
| `feedbacks` | 用户反馈 | `openid`, `content`, `status` |
| `settings` | 系统 KV 配置 | `setting_key`, `setting_value`（存反馈通知 webhook） |
| `notify_settings` | 通知偏好 | `openid`, `enabled`, `drink_reminder` |

连接管理走 Flask 的 `g`：

```python
def get_db():
    if 'db' not in g:
        conn = pymysql.connect(**_CFG)
        _ensure_database(conn)
        g.db = conn
    return g.db

app.teardown_appcontext(db.close_db)   # 请求结束自动关闭
```

`_CFG` 里还替换了 PyMySQL 的类型转换器，把 `DECIMAL` 转 `float`、
`DATETIME`/`DATE` 转字符串——否则 Flask 的 `jsonify` 会因为无法序列化 `Decimal` 而报错。

**按用户隔离**：所有业务表的查询都带 `WHERE openid = %s`，用户之间互不可见。

---

## 数据保留策略

`db.py` 里 `RETENTION_DAYS = 60`。首次建表后（以及后续每次冷启动）会执行 `cleanup()`，
删除超过保留期的记账、待办、打卡、分数与反馈记录。

清理失败会静默回滚，**不影响主流程**——宁可留着旧数据，也不能让用户请求失败。

---

## 前端结构

```
src/miniapp/
├── app.js / app.json / app.wxss   全局入口、页面注册表、全局样式
├── sitemap.json
├── utils/
│   ├── api.js                     统一请求封装（本地/云托管双模式）
│   └── util.js                    通用工具函数
└── pages/<name>/                  每个页面 4 件套
    ├── <name>.js                  逻辑
    ├── <name>.wxml                结构
    ├── <name>.wxss                样式
    └── <name>.json                页面配置
```

`app.json` 的 `pages` 数组是页面注册表，第一个即首页。
底部 tabBar 只有「主页」和「我的」两个入口，其余工具从首页九宫格进入。

启用了 `"lazyCodeLoading": "requiredComponents"`，只加载当前页面用到的代码，缩短首屏时间。

---

## 关键设计取舍

**为什么不用 ORM？**
工具类应用的表结构极简（单表、少量索引），手写 SQL 比引入 SQLAlchemy 更轻，
冷启动也更快。`db.py` 提供 `query()` / `query_one()` / `execute()` 三个原语就够用了。

**为什么每请求一条连接？**
云托管按需扩缩容，长连接池在缩容时反而容易踩到失效连接。每请求建连 + `teardown` 关闭，
逻辑简单且不会泄漏。流量上来后再换成连接池也不影响上层代码。

**为什么腾讯云 SDK 是可选依赖？**
`ocr_translate.py` 把 SDK 的 import 包在 `try/except ImportError` 里，
未安装时服务照常启动，只有 OCR / 翻译接口返回 503 并给出可读提示。
这样本地开发不必为了跑通其他功能去配腾讯云密钥。

**为什么「历史上的今天」用本地 JSON？**
`data/history.json` 是人工筛选过的合规事件库（约 12 KB），
避免调用第三方接口带来的合规与稳定性风险。`_is_compliant()` 还留了一道兜底校验。

**为什么字体不进仓库？**
中文字体单文件接近 20 MB，两个加起来 37 MB。放进 Git 会让 clone 变得极慢，
所以改为在容器镜像里 `apt-get install fonts-noto-cjk fonts-arphic-*`，
`font_util.py` 按「仓库内字体 → 系统字体」的顺序逐个回退，找不到就用 Pillow 默认字体。

---

## 模块对照表

| 文件 | 前缀 | 职责 |
| --- | --- | --- |
| `app.py` | `/` | 入口、健康检查、`/calculate_days`、CORS、统一错误处理 |
| `common.py` | — | 响应信封、`openid()` |
| `db.py` | — | MySQL 连接、建表、保留期清理 |
| `account.py` | `/account` | 记账本 |
| `todo.py` | `/todo` | 待办清单 |
| `habit.py` | `/habit` | 习惯打卡 |
| `notify.py` | `/notify` | 通知偏好与喝水提醒 |
| `mortgage.py` | `/mortgage` | 房贷计算 |
| `tax_calc.py` | `/tax` | 个税计算 |
| `unit_convert.py` | `/unit` | 单位换算 |
| `base_convert.py` | `/base` | 进制转换 |
| `id_card.py` | `/idcard` | 身份证解析 |
| `ocr_translate.py` | `/ocr`, `/tmt` | 文字识别、机器翻译 |
| `avatar_wallpaper.py` | `/avatar` | 头像壁纸渲染 |
| `meme_generator.py` | `/meme` | 表情包渲染 |
| `font_util.py` | — | 字体查找与回退 |
| `horoscope.py` | `/horoscope` | 星座运势 |
| `random_decide.py` | `/random` | 抛硬币 / 转盘 / 抽签 / 表格导入 |
| `minesweeper.py` | `/minesweeper` | 扫雷棋盘生成 |
| `snake.py` | `/snake` | 贪吃蛇分数与排行榜 |
| `history_today.py` | `/history` | 历史上的今天 |
| `feedback.py` | `/feedback` | 用户反馈与开发者通知 |
| `wx_callback.py` | `/wx_callback` | 微信服务端回调 |

接口的参数与返回结构见 [`API.md`](API.md)。
