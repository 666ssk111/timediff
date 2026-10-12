# snake.py —— 贪吃蛇（分数提交与排行榜，MySQL，保留 30 天）
from flask import Blueprint, request
import common
import db

snake_bp = Blueprint('snake', __name__, url_prefix='/snake')


@snake_bp.route('/score', methods=['POST'])
def submit():
    try:
        data = request.get_json(silent=True) or {}
        score = max(int(data.get('score', 0)), 0)
        db.execute(
            'INSERT INTO snake_scores(openid, score) VALUES(%s, %s)',
            (common.openid(), score))
        db.cleanup()

        better = db.query_one(
            'SELECT COUNT(*) AS c FROM snake_scores WHERE score > %s '
            'AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)',
            (score, db.RETENTION_DAYS))['c']
        return common.ok({'rank': better + 1})
    except Exception as e:
        return common.fail(f'提交失败：{e}')


@snake_bp.route('/leaderboard', methods=['GET'])
def leaderboard():
    try:
        rows = db.query(
            'SELECT openid, MAX(score) AS best FROM snake_scores '
            'WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY) '
            'GROUP BY openid ORDER BY best DESC LIMIT 20',
            (db.RETENTION_DAYS,))
        return common.ok({'items': rows})
    except Exception as e:
        return common.fail(f'查询失败：{e}')
