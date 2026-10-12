# habit.py —— 喝水打卡 / 习惯养成（MySQL，按用户隔离，保留 60 天）
from datetime import date, timedelta
from flask import Blueprint, request
import common
import db

habit_bp = Blueprint('habit', __name__, url_prefix='/habit')

HABIT_RETENTION_DAYS = 60  # 打卡记录保留 60 天


def _streak(openid, habit_id):
    rows = db.query(
        'SELECT date FROM habit_logs WHERE openid = %s AND habit_id = %s AND count > 0 '
        'ORDER BY date DESC',
        (openid, habit_id))
    days = {r['date'] for r in rows}
    today = date.today()
    cur = today if str(today) in days else today - timedelta(days=1)
    streak = 0
    while str(cur) in days:
        streak += 1
        cur -= timedelta(days=1)
    return streak


def _cleanup_old(openid, habit_id):
    """删除超过 60 天的打卡记录，每个习惯最多保留 60 天"""
    cutoff = (date.today() - timedelta(days=HABIT_RETENTION_DAYS)).strftime('%Y-%m-%d')
    try:
        db.execute(
            'DELETE FROM habit_logs WHERE openid = %s AND habit_id = %s AND date < %s',
            (openid, habit_id, cutoff))
    except Exception:
        pass


@habit_bp.route('/add', methods=['POST'])
def add():
    try:
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        if not name:
            return common.fail('习惯名称不能为空')
        habit_id = db.execute(
            'INSERT INTO habits(openid, name, icon, target) VALUES(%s, %s, %s, %s)',
            (common.openid(), name, data.get('icon', '💧'), int(data.get('target', 1))))
        return common.ok({'id': habit_id})
    except Exception as e:
        return common.fail(f'创建失败：{e}')


@habit_bp.route('/list', methods=['GET'])
def list_habits():
    try:
        openid = common.openid()
        today = str(date.today())
        rows = db.query(
            'SELECT id, name, icon, target FROM habits WHERE openid = %s ORDER BY id DESC',
            (openid,))
        items = []
        for r in rows:
            log = db.query_one(
                'SELECT count FROM habit_logs WHERE openid = %s AND habit_id = %s AND date = %s',
                (openid, r['id'], today))
            items.append({**r, 'today_count': log['count'] if log else 0})
        return common.ok({'items': items})
    except Exception as e:
        return common.fail(f'查询失败：{e}')


@habit_bp.route('/reset', methods=['POST'])
def reset_logs():
    """清空指定习惯的所有打卡记录，从零开始"""
    try:
        data = request.get_json(silent=True) or {}
        openid = common.openid()
        habit_id = int(data.get('habit_id', 0))
        if not habit_id:
            return common.fail('请提供 habit_id')
        db.execute(
            'DELETE FROM habit_logs WHERE openid = %s AND habit_id = %s',
            (openid, habit_id))
        return common.ok({}, '打卡记录已清空')
    except Exception as e:
        return common.fail(f'重置失败：{e}')


@habit_bp.route('/checkin', methods=['POST'])
def checkin():
    try:
        data = request.get_json(silent=True) or {}
        openid = common.openid()
        habit_id = int(data['habit_id'])
        today = str(date.today())

        # MySQL：存在则 count+1，不存在则插入
        db.execute(
            'INSERT INTO habit_logs(openid, habit_id, date, count) '
            'VALUES(%s, %s, %s, 1) '
            'ON DUPLICATE KEY UPDATE count = count + 1',
            (openid, habit_id, today))
        # 清理超过 60 天的旧记录
        _cleanup_old(openid, habit_id)
        db.cleanup()

        streak = _streak(openid, habit_id)
        row = db.query_one(
            'SELECT count FROM habit_logs WHERE openid = %s AND habit_id = %s AND date = %s',
            (openid, habit_id, today))
        return common.ok({'today_count': row['count'], 'streak': streak})
    except Exception as e:
        return common.fail(f'打卡失败：{e}')


@habit_bp.route('/stats', methods=['GET'])
def stats():
    try:
        openid = common.openid()
        habit_id = int(request.args.get('habit_id'))
        streak = _streak(openid, habit_id)
        cutoff = db.cutoff_date()
        days = db.query(
            'SELECT date, count FROM habit_logs '
            'WHERE openid = %s AND habit_id = %s AND date >= %s ORDER BY date',
            (openid, habit_id, cutoff))
        return common.ok({'streak': streak, 'logs': days})
    except Exception as e:
        return common.fail(f'统计失败：{e}')


@habit_bp.route('/history', methods=['GET'])
def history():
    """获取指定月份的打卡记录，用于日历展示"""
    try:
        openid = common.openid()
        habit_id = int(request.args.get('habit_id'))
        month = request.args.get('month', '')  # 格式 YYYY-MM

        if not month:
            today = date.today()
            month = today.strftime('%Y-%m')

        # 查询该月所有打卡记录
        rows = db.query(
            'SELECT date, count FROM habit_logs '
            'WHERE openid = %s AND habit_id = %s AND date LIKE %s '
            'ORDER BY date',
            (openid, habit_id, month + '%'))

        # 转为 {date: count} 字典
        log_map = {r['date']: r['count'] for r in rows}

        return common.ok({
            'month': month,
            'logs': log_map,
        })
    except Exception as e:
        return common.fail(f'查询失败：{e}')


@habit_bp.route('/day', methods=['GET'])
def day_detail():
    """获取某一天的打卡详情"""
    try:
        openid = common.openid()
        habit_id = int(request.args.get('habit_id'))
        day = request.args.get('date', '')  # YYYY-MM-DD

        if not day:
            return common.fail('请提供日期')

        row = db.query_one(
            'SELECT date, count, created_at FROM habit_logs '
            'WHERE openid = %s AND habit_id = %s AND date = %s',
            (openid, habit_id, day))

        if row:
            return common.ok({
                'date': row['date'],
                'count': row['count'],
                'created_at': row['created_at'],
            })
        else:
            return common.ok({
                'date': day,
                'count': 0,
                'created_at': None,
            })
    except Exception as e:
        return common.fail(f'查询失败：{e}')
