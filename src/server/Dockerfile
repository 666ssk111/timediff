# 微信云托管 Python 服务镜像
#
# 构建上下文 = 仓库根目录，Dockerfile 路径 = src/server/Dockerfile
# （微信云托管控制台里对应「构建目录」填 . 、「Dockerfile 路径」填 src/server/Dockerfile）
FROM python:3.11-slim

WORKDIR /app

# 中文字体：头像壁纸 / 表情包渲染需要。
# 仓库里不放字体文件（单文件近 20MB），改为在镜像里装系统字体。
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk \
    fonts-liberation \
    fonts-arphic-uming \
    fonts-arphic-ukai \
    && rm -rf /var/lib/apt/lists/*

# 依赖清单以仓库根目录的 requirements.txt 为唯一来源
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple

# 拷贝后端代码（含 data/ 历史事件数据）
COPY src/server/ ./

EXPOSE 80

# 云托管默认监听 80 端口，用 gunicorn 承载 Flask 应用
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:80", "--workers", "2", "--timeout", "120"]
