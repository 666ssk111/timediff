# notify.py —— 消息通知设置 & 喝水提醒
from datetime import date, datetime
from flask import Blueprint, request
import common
import db

notify_bp = Blueprint('notify', __name__, url_prefix='/notify')


def _get_settings(openid):
    """获取用户通知设置，没有则返回默认值"""
    row = db.query_one(
        'SELECT enabled, drink_reminder FROM notify_settings WHERE openid = %s',
        (openid,))
    if row:
        return {'enabled': bool(row['enabled']), 'drink_reminder': bool(row['drink_reminder'])}
    # 默认全部开启
    return {'enabled': True, 'drink_reminder': True}


@notify_bp.route('/settings', methods=['GET'])
def get_settings():
    try:
        settings = _get_settings(common.openid())
        return common.ok(settings)
    except Exception as e:
        return common.fail(f'查询失败：{e}')


@notify_bp.route('/settings', methods=['POST'])
def save_settings():
    try:
        data = request.get_json(silent=True) or {}
        openid = common.openid()

        enabled = 1 if data.get('enabled', True) else 0
        drink_reminder = 1 if data.get('drink_reminder', True) else 0

        db.execute(
            'INSERT INTO notify_settings (openid, enabled, drink_reminder) '
            'VALUES (%s, %s, %s) '
            'ON DUPLICATE KEY UPDATE enabled = %s, drink_reminder = %s',
            (openid, enabled, drink_reminder, enabled, drink_reminder))

        return common.ok({
            'enabled': bool(enabled),
            'drink_reminder': bool(drink_reminder)
        }, '保存成功')
    except Exception as e:
        return common.fail(f'保存失败：{e}')


@notify_bp.route('/check-drink', methods=['GET'])
def check_drink_reminder():
    """检查今天是否需要喝水提醒（中午12点后、未打卡、通知已开启）"""
    try:
        openid = common.openid()
        settings = _get_settings(openid)

        if not settings['enabled'] or not settings['drink_reminder']:
            return common.ok({'need_remind': False, 'reason': '通知已关闭'})

        # 检查是否已过中午12点
        now = datetime.now()
        if now.hour < 12:
            return common.ok({'need_remind': False, 'reason': '尚未到中午'})

        today_str = str(date.today())

        # 查找喝水习惯
        habit = db.query_one(
            'SELECT id FROM habits WHERE openid = %s AND name = %s',
            (openid, '喝水'))
        if not habit:
            return common.ok({'need_remind': False, 'reason': '未创建喝水习惯'})

        # 检查今日是否已打卡
        log = db.query_one(
            'SELECT count FROM habit_logs WHERE openid = %s AND habit_id = %s AND date = %s',
            (openid, habit['id'], today_str))

        if log and log['count'] > 0:
            return common.ok({'need_remind': False, 'reason': '今日已打卡', 'today_count': log['count']})

        return common.ok({'need_remind': True, 'reason': '今日尚未打卡', 'today_count': 0})

    except Exception as e:
        return common.fail(f'检查失败：{e}')