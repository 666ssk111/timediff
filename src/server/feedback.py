# feedback.py —— 用户反馈（MySQL，按用户隔离 + 开发者通知）
from flask import Blueprint, request
import common
import db
import re
import json
import urllib.request
import urllib.error
from datetime import datetime

feedback_bp = Blueprint('feedback', __name__, url_prefix='/feedback')

# 敏感词列表（可扩展）
SENSITIVE_WORDS = ['傻逼', '操你', '妈的', '垃圾', '废物', '滚']

# 代码特征正则
CODE_PATTERNS = [
    r'function\s*\(',           # function(
    r'const\s+\w+\s*=',         # const xxx =
    r'let\s+\w+\s*=',           # let xxx =
    r'var\s+\w+\s*=',           # var xxx =
    r'import\s+.*from',         # import ... from
    r'require\s*\(',            # require(
    r'=>\s*\{',                 # () => {
    r'<\/?[a-zA-Z][^>]*>',      # HTML 标签
    r'console\.log',            # console.log
    r'document\.',              # document.xxx
    r'window\.',                # window.xxx
    r'\{\{.*\}\}',              # {{ }} 模板语法
    r'wx\.\w+\('                # wx.xxx(
]


def validate_feedback(content):
    """校验反馈内容，返回 (是否通过, 错误信息)"""
    # 代码特征检测
    for pattern in CODE_PATTERNS:
        if re.search(pattern, content):
            return False, '反馈内容不能包含代码'

    # 敏感词检测
    for word in SENSITIVE_WORDS:
        if word in content:
            return False, '反馈内容包含不当用语'

    return True, None


def _build_payload(title, content, webhook_url, extra=None):
    """根据 webhook 类型构建正确的消息体"""
    is_serverchan = 'sctapi.ftqq.com' in webhook_url

    if is_serverchan:
        # Server 酱格式：title + desp
        return {
            'title': title,
            'desp': content
        }
    else:
        # 通用格式
        payload = {
            'title': title,
            'content': content,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        if extra:
            payload.update(extra)
        return payload


def send_developer_notification(content, openid, feedback_id):
    """向开发者发送反馈通知"""
    webhook_url = db.get_setting('feedback_webhook_url')
    if not webhook_url:
        return

    try:
        title = f'收到新的用户反馈 #{feedback_id}'
        body = (
            f'## 反馈内容\n\n{content}\n\n'
            f'---\n'
            f'反馈ID: {feedback_id}\n'
            f'用户: {openid}\n'
            f'时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
        )
        payload = _build_payload(title, body, webhook_url,
                                 extra={'type': 'feedback', 'feedback_id': feedback_id, 'openid': openid})

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            webhook_url,
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )

        with urllib.request.urlopen(req, timeout=5) as response:
            response.read()
    except Exception as e:
        print(f'反馈通知发送失败: {e}')


@feedback_bp.route('/submit', methods=['POST'])
def submit():
    try:
        data = request.get_json(silent=True) or {}
        content = (data.get('content') or '').strip()
        openid = data.get('openid') or common.openid()

        # 校验
        valid, error = validate_feedback(content)
        if not valid:
            return common.fail(error)

        # 存储到数据库
        feedback_id = db.execute(
            'INSERT INTO feedbacks(openid, content) VALUES(%s, %s)',
            (openid, content))

        # 发送开发者通知
        send_developer_notification(content, openid, feedback_id)

        return common.ok({'id': feedback_id, 'message': '反馈已提交'})
    except Exception as e:
        return common.fail(f'提交失败：{e}')


@feedback_bp.route('/list', methods=['GET'])
def list_feedbacks():
    """列出所有反馈（管理员接口，暂不对外开放）"""
    try:
        page = max(int(request.args.get('page', 1)), 1)
        size = min(max(int(request.args.get('size', 20)), 1), 100)

        total = db.query_one('SELECT COUNT(*) AS c FROM feedbacks')['c']
        rows = db.query(
            'SELECT id, openid, content, status, created_at FROM feedbacks '
            'ORDER BY created_at DESC LIMIT %s OFFSET %s',
            [size, (page - 1) * size])

        return common.ok({'total': total, 'page': page, 'items': rows})
    except Exception as e:
        return common.fail(f'查询失败：{e}')


@feedback_bp.route('/webhook/config', methods=['POST'])
def configure_webhook():
    """配置开发者通知 webhook 地址（持久化到数据库）"""
    try:
        data = request.get_json(silent=True) or {}
        webhook_url = (data.get('webhook_url') or '').strip()

        if not webhook_url:
            return common.fail('请提供有效的 webhook URL')

        # 验证 URL 格式
        if not webhook_url.startswith(('http://', 'https://')):
            return common.fail('webhook URL 必须以 http:// 或 https:// 开头')

        # 持久化到数据库
        db.set_setting('feedback_webhook_url', webhook_url)

        return common.ok({'message': 'webhook 配置已保存', 'enabled': True})
    except Exception as e:
        return common.fail(f'配置失败：{e}')


@feedback_bp.route('/webhook/test', methods=['POST'])
def test_webhook():
    """测试 webhook 通知"""
    try:
        webhook_url = db.get_setting('feedback_webhook_url')
        if not webhook_url:
            return common.fail('请先配置 webhook 地址')

        payload = _build_payload(
            '测试通知',
            '反馈系统已成功连接！\n\n这是一条测试消息，收到此消息说明通知配置正确。',
            webhook_url
        )

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            webhook_url,
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )

        with urllib.request.urlopen(req, timeout=5) as response:
            response.read()

        return common.ok({'message': '测试通知发送成功'})
    except urllib.error.HTTPError as e:
        return common.fail(f'通知发送失败 (HTTP {e.code}): {e.reason}')
    except urllib.error.URLError as e:
        return common.fail(f'通知发送失败: {e.reason}')
    except Exception as e:
        return common.fail(f'测试失败：{e}')


@feedback_bp.route('/webhook/status', methods=['GET'])
def webhook_status():
    """查看 webhook 配置状态"""
    webhook_url = db.get_setting('feedback_webhook_url')
    enabled = bool(webhook_url)

    return common.ok({
        'enabled': enabled,
        'url': webhook_url or ''
    })
