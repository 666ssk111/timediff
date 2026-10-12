"""pytest 共享配置。

关键点：把 src/server 加进 sys.path，让测试可以像线上那样直接
`import app` / `import common` / `import unit_convert`（后端代码用的是
平铺的相对导入，不是包导入）。

测试全程使用 Flask 测试客户端，不会建立真实 MySQL 连接，
因此 CI 不需要任何真实凭据。
"""
import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = REPO_ROOT / "src" / "server"

if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

# 只给占位值：模块导入期只读环境变量，不会真的去连库。
os.environ.setdefault("MYSQL_HOST", "127.0.0.1")
os.environ.setdefault("MYSQL_PORT", "3306")
os.environ.setdefault("MYSQL_USERNAME", "root")
os.environ.setdefault("MYSQL_PASSWORD", "test-dummy-password")
os.environ.setdefault("MYSQL_DATABASE", "miniapp_tools_test")
os.environ.setdefault("TENCENT_SECRET_ID", "")
os.environ.setdefault("TENCENT_SECRET_KEY", "")


@pytest.fixture(scope="session")
def app():
    """整个测试会话复用一个 Flask app。"""
    import app as server_app

    server_app.app.config.update(TESTING=True)
    return server_app.app


@pytest.fixture()
def client(app):
    """Flask 测试客户端。"""
    return app.test_client()
