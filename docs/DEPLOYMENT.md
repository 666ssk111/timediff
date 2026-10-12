# 部署指南

从本地跑通到上线微信云托管的完整步骤。

---

## 目录

- [前置条件](#前置条件)
- [一、本地开发](#一本地开发)
- [二、本地验证容器镜像](#二本地验证容器镜像)
- [三、部署到微信云托管](#三部署到微信云托管)
- [四、小程序端切到生产](#四小程序端切到生产)
- [五、配置反馈通知](#五配置反馈通知)
- [六、常见问题](#六常见问题)

---

## 前置条件

| 需要 | 说明 |
| --- | --- |
| Python 3.11+ | 后端运行环境（CI 覆盖 3.11 与 3.12） |
| Node.js 18+ | 只用于 `npm run lint`，跑小程序不需要 |
| 微信开发者工具 | 打开并调试小程序 |
| MySQL 5.7+ / 8.0 | 记账、待办、打卡等功能需要 |
| 微信云托管环境 | 部署后端（需已注册小程序并开通云托管） |
| Docker（可选） | 本地验证镜像 |

---

## 一、本地开发

### 1. 后端

```bash
git clone https://github.com/666ssk111/timediff.git
cd timediff

python -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

cp .env.example .env
```

编辑 `.env`，至少填上数据库口令：

```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USERNAME=root
MYSQL_PASSWORD=你的本地口令
MYSQL_DATABASE=miniapp_tools
```

启动：

```bash
python src/server/app.py
```

首次请求时会自动 `CREATE DATABASE IF NOT EXISTS` 并建好全部表，无需手动执行 SQL。

自检：

```bash
curl http://127.0.0.1:3000/health
curl -X POST http://127.0.0.1:3000/calculate_days \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2024-01-01","end_date":"2024-01-31"}'
```

### 2. 小程序

1. 微信开发者工具 → 导入项目 → 选择 `src/miniapp/` 目录。
2. 把 `project.config.json` 里的 `appid` 换成你自己的小程序 AppID。
3. 确认 `src/miniapp/utils/api.js` 处于本地模式：

   ```js
   const USE_LOCAL = true;
   const LOCAL_BASE_URL = 'http://127.0.0.1:3000';
   ```

4. 开发者工具 → 详情 → 本地设置 → 勾选**不校验合法域名**。
5. 编译预览，首页九宫格能点开各个工具即表示联通。

### 3. 跑测试

```bash
pytest                    # 后端单测，不连真实数据库
ruff check src/server tests
npm run lint              # 小程序 JS 语法 + JSON 校验
```

---

## 二、本地验证容器镜像

构建上下文是**仓库根目录**，Dockerfile 在 `src/server/`：

```bash
docker build -f src/server/Dockerfile -t timediff-server .
docker run --rm -p 3000:80 --env-file .env timediff-server
curl http://127.0.0.1:3000/health
```

镜像里已经通过 `apt-get` 装好 `fonts-noto-cjk` / `fonts-arphic-*`，
所以头像壁纸和表情包渲染在没有仓库字体文件的情况下也能正常工作。

---

## 三、部署到微信云托管

### 1. 创建环境与服务

1. 微信公众平台 → 云托管 → 新建环境。
2. 在环境里新建服务，例如命名为 `flask-ga47`（这个名字要和小程序端 `SERVICE` 一致）。
3. 代码源选择 **GitHub**，授权并选中本仓库与目标分支。

### 2. 填写构建参数

| 控制台字段 | 填写值 |
| --- | --- |
| 构建目录 / 上下文 | `.`（仓库根目录） |
| Dockerfile 路径 | `src/server/Dockerfile` |
| 监听端口 | `80` |
| 启动命令 | 用镜像里的默认值（`gunicorn app:app --bind 0.0.0.0:80 ...`） |

> **如果控制台不允许把上下文设成仓库根目录**：把根目录 `requirements.txt`
> 复制一份到 `src/server/`，然后把 `src/server/Dockerfile` 里的
> `COPY requirements.txt ./` 和 `COPY src/server/ ./` 改成 `COPY . .`，
> 并把构建目录设为 `src/server`。

### 3. 配置环境变量

在服务的「环境变量」里加：

| 变量 | 值 |
| --- | --- |
| `MYSQL_USERNAME` | 数据库账号（云托管会推送到微信） |
| `MYSQL_PASSWORD` | 数据库口令（云托管会推送到微信） |
| `MYSQL_DATABASE` | `miniapp_tools` |
| `TENCENT_SECRET_ID` | 可选，OCR / 翻译用 |
| `TENCENT_SECRET_KEY` | 可选，OCR / 翻译用 |

**不要填 `MYSQL_ADDRESS`**，云托管会自动注入，手填会覆盖掉正确值。

### 4. 部署并验证

点击部署，等状态变成「运行中」后：

- 用控制台给的**公网域名**访问 `/health`，应返回 `{"code":0,"data":{"status":"ok"},...}`
- 或在「云端调试」里直接执行请求

---

## 四、小程序端切到生产

改 `src/miniapp/utils/api.js`：

```js
const USE_LOCAL = false;
const ENV = 'prod-d7gbnxjit907040e0';   // 云环境 ID（本项目的真实值）
const SERVICE = 'flask-ga47';           // 云托管服务名（本项目的真实值）
```

然后在 `project.config.json` 里确认 `appid` 是你自己的。
重新编译预览，请求会走 `wx.cloud.callContainer` 到云托管。

> 仓库里已经填好本项目的真实值。**如果你要部署到自己的小程序 / 云环境**，
> 这三项（`ENV`、`SERVICE`、`project.config.json` 的 `appid`）都要换成你自己的，
> 否则请求会打到别人的服务上。

---

## 五、配置反馈通知

用户提交反馈后可以把内容推送到企业微信 / 钉钉 / 飞书 / Server 酱。
配置步骤见 [NOTIFICATION_SETUP.md](NOTIFICATION_SETUP.md)。

核心就两步：部署后调一次配置接口，再调一次测试接口。

```bash
curl -X POST https://你的域名/feedback/webhook/config \
  -H "Content-Type: application/json" \
  -d '{"webhook_url":"你的webhook地址"}'

curl -X POST https://你的域名/feedback/webhook/test
```

webhook 地址存在数据库的 `settings` 表里，重启服务不会丢。

---

## 六、常见问题

**Q：容器起来了但接口报数据库连接失败？**
先确认云托管的 MySQL 和本服务在**同一个环境**里；再确认没有手动设置 `MYSQL_ADDRESS`。
云托管只注入 `MYSQL_ADDRESS` / `MYSQL_USERNAME` / `MYSQL_PASSWORD` 三个变量，
`db.py` 会优先用 `MYSQL_ADDRESS`。

**Q：本地联调请求全部失败？**
检查三件事：后端是否在 3000 端口、`USE_LOCAL` 是否为 `true`、
开发者工具是否勾选了「不校验合法域名」。

**Q：小程序报「请求失败」但后端日志正常？**
多半是响应体不是 JSON。检查是否有未捕获异常绕过了 `app.py` 的错误处理器。

**Q：OCR / 翻译返回 503？**
两种原因：没配 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`，
或者腾讯云控制台里对应服务（文字识别 / 机器翻译）还没开通。
接口返回的 `message` 会明确告诉你是哪一种。

**Q：头像壁纸渲染出来是方块或乱码？**
镜像里缺中文字体。确认 Dockerfile 里的 `apt-get install fonts-noto-cjk` 没被删掉，
并且 `font_util.py` 的系统字体回退路径在容器内存在
（`/usr/share/fonts/opentype/noto/`、`/usr/share/fonts/truetype/arphic/`）。

**Q：CI 的「仓库卫生检查」失败了？**
看报错指向哪一类：
- 密钥文件 → 从 Git 里移除并加进 `.gitignore`（注意：**历史提交里的密钥需要重写历史或直接作废该密钥**）
- 大文件 → 改用 Git LFS 或 Releases，见 README 的[大文件怎么处理](../README.md#大文件怎么处理)
