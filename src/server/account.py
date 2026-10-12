# account.py —— 记账本（MySQL，按用户隔离，保留 30 天）
from flask import Blueprint, request
import common
import db

account_bp = Blueprint('account', __name__, url_prefix='/account')


@account_bp.route('/add', methods=['POST'])
def add():
    try:
        data = request.get_json(silent=True) or {}
        amount = float(data['amount'])
        if amount <= 0:
            return common.fail('金额必须大于 0')
        bill_id = db.execute(
            'INSERT INTO bills(openid, amount, type, category, note, date) '
            'VALUES(%s, %s, %s, %s, %s, %s)',
            (common.openid(), amount, int(data.get('type', 2)),
             data.get('category', '其他'), data.get('note', ''), data.get('date')))
        db.cleanup()   # 写入后清理超过 30 天的旧数据
        return common.ok({'id': bill_id})
    except Exception as e:
        return common.fail(f'添加失败：{e}')


@account_bp.route('/list', methods=['GET'])
def list_bills():
    try:
        start = request.args.get('start', '')
        end = request.args.get('end', '')
        page = max(int(request.args.get('page', 1)), 1)
        size = min(max(int(request.args.get('size', 20)), 1), 100)

        # 默认只返回保留期（30 天）内的数据
        cutoff = db.cutoff_date()
        if start:
            start = max(start, cutoff)
        else:
            start = cutoff

        where = ['openid = %s', 'date >= %s']
        params = [common.openid(), start]
        if end:
            where.append('date <= %s')
            params.append(end)
        cond = ' WHERE ' + ' AND '.join(where)

        total = db.query_one('SELECT COUNT(*) AS c FROM bills' + cond, params)['c']
        rows = db.query(
            'SELECT id, amount, type, category, note, date FROM bills' + cond +
            ' ORDER BY date DESC, id DESC LIMIT %s OFFSET %s',
            params + [size, (page - 1) * size])
        return common.ok({'total': total, 'page': page, 'items': rows})
    except Exception as e:
        return common.fail(f'查询失败：{e}')


@account_bp.route('/delete', methods=['POST'])
def delete():
    try:
        data = request.get_json(silent=True) or {}
        db.execute('DELETE FROM bills WHERE id = %s AND openid = %s',
                   (int(data['id']), common.openid()))
        return common.ok({'deleted': True})
    except Exception as e:
        return common.fail(f'删除失败：{e}')


@account_bp.route('/summary', methods=['GET'])
def summary():
    try:
        month = request.args.get('month', '')
        cutoff = db.cutoff_date()
        where = ['openid = %s', 'date >= %s']
        params = [common.openid(), cutoff]
        if month:
            where.append("SUBSTR(date, 1, 7) = %s")
            params.append(month)
        cond = ' WHERE ' + ' AND '.join(where)

        rows = db.query(
            'SELECT category, type, SUM(amount) AS total FROM bills' + cond +
            ' GROUP BY category, type', params)
        income = round(sum(r['total'] for r in rows if r['type'] == 1), 2)
        expense = round(sum(r['total'] for r in rows if r['type'] == 2), 2)
        return common.ok({'income': income, 'expense': expense,
                          'balance': round(income - expense, 2),
                          'by_category': rows})
    except Exception as e:
        return common.fail(f'统计失败：{e}')
