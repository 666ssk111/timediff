# 微信小程序工具箱 · timediff

[![CI](https://github.com/666ssk111/timediff/actions/workflows/ci.yml/badge.svg)](https://github.com/666ssk111/timediff/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11%20%7C%203.12-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.x-000000.svg)](https://flask.palletsprojects.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/666ssk111/timediff/pulls)

一个「日常小工具合集」微信小程序：**25 个即开即用的小工具**，配一套 Flask 后端，
部署在**微信云托管**上，数据按用户 `openid` 隔离。

- 🧰 计算、换算、查询、记账、打卡、小游戏，一个入口全搞定
- 🔐 数据按用户隔离，超过保留期自动清理
- 🚀 后端零改造成本上微信云托管，`gunicorn` + `MySQL`
- ✅ CI 全绿：Python 单测 + 小程序静态检查 + 密钥/大文件守卫
- 📦 仓库不含任何密钥、大文件或构建产物

---

## 目录

- [功能一览](#功能一览)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [测试与代码检查](#测试与代码检查)
- [部署到微信云托管](#部署到微信云托管)
- [大文件怎么处理](#大文件怎么处理)
- [安全约定](#安全约定)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

---

## 功能一览

小程序共 25 个页面，按用途分成四类：

| 分类 | 工具 |
| --- | --- |
| 🧮 **计算与换算** | 日期计算、房贷计算器（等额本息/等额本金）、个税计算器、单位换算、进制转换 |
| 📋 **效率与生活** | 记账本（含分类管理）、待办清单、习惯打卡、喝水提醒、历史上的今天 |
| 🔤 **文本与图像** | 身份证解析、OCR 文字识别、中英机器翻译、头像壁纸生成、表情包生成 |
| 🎲 **娱乐** | 星座运势、随机决定（抛硬币/转盘/抽签/表格导入）、扫雷、贪吃蛇、消星星、2048、蜘蛛纸牌、数独 |

后端把每个功能拆成一个 Flask **Blueprint**，统一挂载在 `app.py`，统一响应结构在 `common.py`。
完整的接口清单见 [`docs/API.md`](docs/API.md)。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 小程序前端 | 微信小程序原生（WXML / WXSS / JS），`glass-easel` 组件框架，`lazyCodeLoading` |
| 后端 | Python 3.11+ / Flask 3，Blueprint 分模块 |
| 数据库 | MySQL（PyMySQL），建表与保留期清理自动执行 |
| 图像处理 | Pillow（头像壁纸、表情包渲染） |
| 云服务 | 腾讯云 OCR / 机器翻译 SDK（可选依赖） |
| 部署 | 微信云托管（容器），`gunicorn` 监听 80 |
| CI | GitHub Actions（pytest + ruff + Node 静态检查 + 仓库卫生守卫） |

---

## 目录结构

```
.
├── README.md
├── LICENSE                     # MIT
├── .gitignore                  # 密钥 / 缓存 / 构建产物 / 大文件 全部排除
├── .gitattributes              # 统一换行符为 LF，二进制不做转换
├── .dockerignore               # 镜像构建上下文排除规则
├── .env.example                # 环境变量模板（真实 .env 不入库）
├── requirements.txt            # 后端运行时依赖（容器与 CI 的唯一来源）
├── requirements-dev.txt        # 开发/测试依赖
├── pyproject.toml              # ruff + pytest 配置
├── package.json                # 小程序静态检查脚本
├── .github/
│   └── workflows/
│       └── ci.yml              # CI：后端测试 + 小程序检查 + 仓库卫生
├── src/
│   ├── server/                 # Flask 后端（微信云托管服务）
│   │   ├── app.py              # 入口：注册全部蓝图 + CORS + 统一错误处理
│   │   ├── common.py           # 统一响应结构与 openid 读取
│   │   ├── db.py               # MySQL 连接、建表、保留期清理
│   │   ├── Dockerfile          # 容器镜像定义
│   │   ├── data/history.json   # 「历史上的今天」本地事件库
│   │   └── *.py                # 各功能 Blueprint（account / todo / habit / ...）
│   └── miniapp/                # 微信小程序前端
│       ├── app.js / app.json / app.wxss
│       ├── pages/              # 25 个页面
│       └── utils/              # api.js 请求封装、util.js 工具函数
├── tests/                      # pytest 测试（不依赖真实数据库）
├── docs/                       # 架构、接口、部署、通知配置文档
└── scripts/
    └── check-js.mjs            # 零依赖的小程序 JS/JSON 静态检查
```

---

## 快速开始

### 1. 后端（本地联调）

```bash
git clone https://github.com/666ssk111/timediff.git
cd timediff

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

cp .env.example .env               # 然后填上你自己的 MySQL 口令
python src/server/app.py           # 默认监听 http://127.0.0.1:3000
```

验证服务是否起来：

```bash
curl http://127.0.0.1:3000/health
# {"code":0,"data":{"status":"ok"},"message":"ok"}
```

> `src/server/app.py` 直接运行时会把 `src/server` 当工作目录读取 `data/`，
> 用上面的命令即可。若想从 `src/server` 目录内启动，`python app.py` 也可以。

### 2. 小程序

1. 用**微信开发者工具**打开 `src/miniapp/` 目录。
2. 在 `src/miniapp/utils/api.js` 里选择运行模式：

   ```js
   const USE_LOCAL = true;    // 本地联调：走 http://127.0.0.1:3000
   const USE_LOCAL = false;   // 生产：走 wx.cloud.callContainer 云托管
   ```

3. 本地联调时在开发者工具里勾选「不校验合法域名」。
4. 仓库里已经带上本项目的真实配置（`appid`、云环境 ID、服务名），开箱即用。

> **如果你要部署到自己的小程序 / 云环境**，需要把这三项换成你自己的值：
> `src/miniapp/project.config.json` 的 `appid`、
> `src/miniapp/utils/api.js` 的 `ENV`（云环境 ID）与 `SERVICE`（服务名）。

---

## 环境变量

所有变量见 [`.env.example`](.env.example)。核心的几个：

| 变量 | 说明 | 必填 |
| --- | --- | --- |
| `PORT` | 本地监听端口，默认 `3000`；云托管由 gunicorn 固定 80 | 否 |
| `MYSQL_ADDRESS` | `host:port`，云托管自动注入，优先级最高 | 云托管自动 |
| `MYSQL_HOST` / `MYSQL_PORT` | 本地开发的 MySQL 地址 | 本地必填 |
| `MYSQL_USERNAME` / `MYSQL_PASSWORD` | 数据库账号口令 | 是 |
| `MYSQL_DATABASE` | 库名，默认 `miniapp_tools` | 否 |
| `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` | OCR 与机器翻译，不配则相关接口返回 503 | 否 |

**没有任何密钥写死在代码里**：`src/server/db.py` 只从环境变量读口令，
`src/server/ocr_translate.py` 只从环境变量读腾讯云密钥。

---

## 测试与代码检查

```bash
# 后端单测（不连真实数据库，用 Flask 测试客户端）
pytest

# 只跑某个模块
pytest tests/test_calculators.py -v

# 静态检查
ruff check src/server tests

# 小程序 JS 语法 + JSON 校验（零依赖）
npm run lint
```

测试覆盖：健康检查与统一错误响应、单位/进制换算、房贷与个税（精确值断言）、
身份证解析、扫雷棋盘、历史上的今天、随机决定与 Excel 导入，
以及一组**仓库卫生测试**——结构完整性、`.env` 未入库、无大文件、无字面量密钥。

---

## 部署到微信云托管

### 构建参数

| 项 | 值 |
| --- | --- |
| 构建目录（上下文） | `.`（仓库根目录） |
| Dockerfile 路径 | `src/server/Dockerfile` |
| 监听端口 | `80` |

`Dockerfile` 用根目录的 `requirements.txt` 装依赖，再 `COPY src/server/` 进镜像，
因此依赖清单只有一份，不会出现「两处版本不一致」。

> 如果你的云托管控制台强制要求「构建目录 = Dockerfile 所在目录」，
> 把根目录的 `requirements.txt` 复制一份到 `src/server/`，
> 并把 Dockerfile 里的 `COPY src/server/ ./` 改成 `COPY . .` 即可。

### 环境变量

在云托管控制台的「环境变量」里配置 `MYSQL_USERNAME`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`，
以及可选的 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`。
`MYSQL_ADDRESS` 由云托管自动注入，**不要手填**。

数据库账号口令由云托管以服务通知形式推送到微信，请妥善保管，不要提交到仓库。

### 本地构建镜像验证

```bash
docker build -f src/server/Dockerfile -t timediff-server .
docker run --rm -p 3000:80 --env-file .env timediff-server
curl http://127.0.0.1:3000/health
```

更多细节见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。

---

## 大文件怎么处理

**本仓库刻意不包含任何大文件、数据集或二进制产物**，CI 里有一条硬性守卫：
任何被 Git 跟踪的文件超过 **1 MiB** 都会让流水线失败。

已知的两类大文件及其处理方式：

| 内容 | 原体积 | 处理方式 |
| --- | --- | --- |
| 中文字体（`msyh.ttc`、`NotoSansSC-Regular.ttf`） | 约 37 MB | **不进仓库**。容器镜像里通过 `apt-get install fonts-noto-cjk fonts-arphic-*` 安装系统字体，`src/server/font_util.py` 会自动回退到系统字体路径 |
| 项目压缩包（`time_curtime.zip` 等） | 约 23 MB | **不进仓库**。需要分发时走 GitHub **Releases** |

如果你确实需要把二进制纳入版本管理，请用 **Git LFS**：

```bash
git lfs install
git lfs track "*.ttf" "*.ttc" "*.zip"
git add .gitattributes
```

否则请把大文件挂到 **Releases** 的附件里，README 里给下载链接。

---

## 安全约定

- 🚫 不提交 `.env`、口令、Token、证书、私钥——`.gitignore` 已覆盖，CI 还有一道守卫
- ✅ 只提交 `.env.example` 这类**模板**，值一律留空
- 🚫 不提交 `node_modules/`、`venv/`、`__pycache__/`
- 🚫 不提交 `dist/`、`build/` 等构建产物
- 🔑 数据库口令只从环境变量读取，代码里的默认值是空串
- 👤 用户数据按 `openid` 隔离，并在超过保留期（默认 60 天）后自动清理

如果你发现安全问题，请不要开 public issue，改用仓库的 Security Advisory 私下反馈。

---

## 参与贡献

1. Fork 本仓库并新建分支：`git checkout -b feat/your-feature`
2. 提交前本地跑通：

   ```bash
   pytest && ruff check src/server tests && npm run lint
   ```

3. 提交 PR，描述清楚「改了什么」和「怎么验证」。

新增一个工具的套路：在 `src/server/` 下加一个 Blueprint 模块 → 在 `app.py` 里 import 并
注册到那个 tuple → 在 `src/miniapp/pages/` 下加页面并在 `app.json` 的 `pages` 里登记 →
补上 `tests/`。

---

## 许可证

[MIT](LICENSE)
