# db.py —— MySQL 数据库连接管理（PyMySQL）
# 统一负责：连接、建库建表、用户数据 30 天保留、查询辅助、Decimal 序列化
import os
import pymysql
from datetime import date, timedelta
from flask import g

DB_NAME = os.environ.get('MYSQL_DATABASE', os.environ.get('MYSQL_DB', 'miniapp_tools'))
RETENTION_DAYS = 60   # 每个用户数据默认保留 60 天

# 让 PyMySQL 把 DECIMAL 转 float、DATETIME/DATE 转 str，避免 Flask jsonify 无法序列化
from pymysql import converters
_CONV = converters.conversions.copy()
_CONV[pymysql.FIELD_TYPE.DECIMAL] = float
_CONV[pymysql.FIELD_TYPE.NEWDECIMAL] = float
_CONV[pymysql.FIELD_TYPE.DATETIME] = lambda x: x.strftime('%Y-%m-%d %H:%M:%S') if x else None
_CONV[pymysql.FIELD_TYPE.TIMESTAMP] = lambda x: x.strftime('%Y-%m-%d %H:%M:%S') if x else None
_CONV[pymysql.FIELD_TYPE.DATE] = lambda x: x.strftime('%Y-%m-%d') if x else None


def _parse_address():
    """解析 MySQL 地址：优先云托管 MYSQL_ADDRESS（host:port），否则用 MYSQL_HOST/MYSQL_PORT。"""
    addr = os.environ.get('MYSQL_ADDRESS', '')
    if addr:
        if ':' in addr:
            host, port = addr.rsplit(':', 1)
            return host, int(port)
        return addr, 3306
    host = os.environ.get('MYSQL_HOST', '127.0.0.1')
    port = int(os.environ.get('MYSQL_PORT', '3306'))
    return host, port


_host, _port = _parse_address()

_CFG = {
    'host': _host,
    'port': _port,
    'user': os.environ.get('MYSQL_USERNAME', os.environ.get('MYSQL_USER', 'root')),
    # 密码只允许来自环境变量，禁止写死在仓库里（参考根目录 .env.example）
    'password': os.environ.get('MYSQL_PASSWORD', ''),
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
    'autocommit': False,
    'conv': _CONV,
}

_schema_ready = False

_SCHEMA = [
    # 记账本
    """CREATE TABLE IF NOT EXISTS bills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(64) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        type TINYINT NOT NULL,
        category VARCHAR(32) NOT NULL,
        note VARCHAR(255) DEFAULT '',
        date VARCHAR(10) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_openid_date (openid, date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    # 待办清单
    """CREATE TABLE IF NOT EXISTS todos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        done TINYINT DEFAULT 0,
        priority INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_openid (openid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    # 习惯定义
    """CREATE TABLE IF NOT EXISTS habits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(64) NOT NULL,
        name VARCHAR(64) NOT NULL,
        icon VARCHAR(16) DEFAULT '💧',
        target INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_openid (openid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    # 打卡日志
    """CREATE TABLE IF NOT EXISTS habit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(64) NOT NULL,
        habit_id INT NOT NULL,
        date VARCHAR(10) NOT NULL,
        count INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_openid_habit_date (openid, habit_id, date),
        KEY idx_openid_date (openid, date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    # 贪吃蛇分数
    """CREATE TABLE IF NOT EXISTS snake_scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(64) NOT NULL,
        score INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_openid_score (openid, score)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    # 用户反馈
    """CREATE TABLE IF NOT EXISTS feedbacks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(64) NOT NULL,
        content TEXT NOT NULL,
        status TINYINT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_openid (openid),
        KEY idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    # 系统设置（key-value 存储，用于 webhook 等配置）
    """CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(64) NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    # 用户通知设置
    """CREATE TABLE IF NOT EXISTS notify_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(64) NOT NULL UNIQUE,
        enabled TINYINT DEFAULT 1,
        drink_reminder TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
]


def get_db():
    """每请求一个连接，保存在 Flask g 中，请求结束自动关闭。"""
    if 'db' not in g:
        conn = pymysql.connect(**_CFG)
        _ensure_database(conn)
        g.db = conn
    return g.db


def close_db(exc=None):
    conn = g.pop('db', None)
    if conn is not None:
        conn.close()


def _ensure_database(conn):
    global _schema_ready
    with conn.cursor() as cur:
        cur.execute(
            'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
            % DB_NAME)
    conn.select_db(DB_NAME)
    if not _schema_ready:
        with conn.cursor() as cur:
            for stmt in _SCHEMA:
                cur.execute(stmt)
        conn.commit()
        cleanup(conn)
        _schema_ready = True


def query(sql, params=None):
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def query_one(sql, params=None):
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def execute(sql, params=None):
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute(sql, params)
        conn.commit()
        return cur.lastrowid


def cutoff_date():
    """返回保留期的起始日期（YYYY-MM-DD）。"""
    return (date.today() - timedelta(days=RETENTION_DAYS)).strftime('%Y-%m-%d')


def get_setting(key, default=''):
    """获取系统设置值"""
    try:
        row = query_one('SELECT setting_value FROM settings WHERE setting_key = %s', (key,))
        return row['setting_value'] if row else default
    except Exception:
        return default


def set_setting(key, value):
    """设置或更新系统设置值"""
    execute(
        'INSERT INTO settings (setting_key, setting_value) VALUES (%s, %s) '
        'ON DUPLICATE KEY UPDATE setting_value = %s',
        (key, value, value))


def cleanup(conn=None):
    """清理超过保留期（默认 30 天）的用户数据，失败时静默回滚不影响主流程。"""
    own = conn is None
    if own:
        conn = get_db()
    try:
        cutoff = cutoff_date()
        with conn.cursor() as cur:
            cur.execute('DELETE FROM bills WHERE date < %s', (cutoff,))
            cur.execute(
                'DELETE FROM todos WHERE created_at < DATE_SUB(NOW(), INTERVAL %s DAY)',
                (RETENTION_DAYS,))
            cur.execute('DELETE FROM habit_logs WHERE date < %s', (cutoff,))
            cur.execute('DELETE FROM snake_scores WHERE created_at < DATE_SUB(NOW(), INTERVAL %s DAY)',
                (RETENTION_DAYS,))
            cur.execute(
                'DELETE FROM feedbacks WHERE created_at < DATE_SUB(NOW(), INTERVAL %s DAY)',
                (RETENTION_DAYS,))
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
