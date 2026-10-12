# todo.py —— 待办事项清单（MySQL，按用户隔离，保留 30 天）
from flask import Blueprint, request
import common
import db

todo_bp = Blueprint('todo', __name__, url_prefix='/todo')


@todo_bp.route('/list', methods=['GET'])
def list_all():
    try:
        rows = db.query(
            'SELECT id, title, done, priority, created_at FROM todos '
            'WHERE openid = %s AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY) '
            'ORDER BY done ASC, priority DESC, id DESC',
            (common.openid(), db.RETENTION_DAYS))
        return common.ok({'items': rows})
    except Exception as e:
        return common.fail(f'查询失败：{e}')


@todo_bp.route('/add', methods=['POST'])
def add():
    try:
        data = request.get_json(silent=True) or {}
        title = (data.get('title') or '').strip()
        if not title:
            return common.fail('待办内容不能为空')
        todo_id = db.execute(
            'INSERT INTO todos(openid, title, priority) VALUES(%s, %s, %s)',
            (common.openid(), title, int(data.get('priority', 0))))
        db.cleanup()
        return common.ok({'id': todo_id})
    except Exception as e:
        return common.fail(f'添加失败：{e}')


@todo_bp.route('/update', methods=['POST'])
def update():
    try:
        data = request.get_json(silent=True) or {}
        todo_id = int(data['id'])
        openid = common.openid()
        if 'done' in data:
            db.execute('UPDATE todos SET done = %s WHERE id = %s AND openid = %s',
                       (1 if data['done'] else 0, todo_id, openid))
        if 'title' in data and (data['title'] or '').strip():
            db.execute('UPDATE todos SET title = %s WHERE id = %s AND openid = %s',
                       (data['title'].strip(), todo_id, openid))
        if 'priority' in data:
            db.execute('UPDATE todos SET priority = %s WHERE id = %s AND openid = %s',
                       (int(data['priority']), todo_id, openid))
        return common.ok({'updated': True})
    except Exception as e:
        return common.fail(f'更新失败：{e}')


@todo_bp.route('/delete', methods=['POST'])
def delete():
    try:
        data = request.get_json(silent=True) or {}
        db.execute('DELETE FROM todos WHERE id = %s AND openid = %s',
                   (int(data['id']), common.openid()))
        return common.ok({'deleted': True})
    except Exception as e:
        return common.fail(f'删除失败：{e}')
