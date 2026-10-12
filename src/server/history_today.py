# history_today.py —— 历史上的今天（本地合规事件库 + 严格内容控制）
import json
import os
from datetime import datetime
from flask import Blueprint, request
import common

history_bp = Blueprint('history', __name__, url_prefix='/history')

_DATA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'history.json')
_cache = None

# 违禁词表：命中即拦截（白名单数据已保证合规，此处作为兜底防线）
_BLOCKED_WORDS = []


def _load():
    global _cache
    if _cache is None:
        try:
            with open(_DATA_PATH, 'r', encoding='utf-8') as f:
                _cache = json.load(f)
        except FileNotFoundError:
            _cache = {}
    return _cache


def _is_compliant(item):
    """合规校验：仅返回公开、合法、正面或中性的历史事件。"""
    if not item or not item.get('year') or not item.get('title') or not item.get('desc'):
        return False
    text = (item.get('title', '') + item.get('desc', '')).lower()
    return not any(w.lower() in text for w in _BLOCKED_WORDS)


def _query(key):
    """严格白名单查询：非公开 / 不合规一律返回 None。"""
    items = _load().get(key, [])
    if not items:
        return None
    compliant = [i for i in items if _is_compliant(i)]
    if not compliant:
        return None
    return sorted(compliant, key=lambda x: x.get('year', 0), reverse=True)


@history_bp.route('/today', methods=['GET'])
def today():
    try:
        month = request.args.get('month') or str(datetime.now().month)
        day = request.args.get('day') or str(datetime.now().day)
        key = f'{int(month):02d}-{int(day):02d}'

        items = _query(key)
        if items is None:
            return common.fail('抱歉，此事件无法查询', code=2, http_status=200)

        return common.ok({'date': key, 'count': len(items), 'items': items})
    except Exception as e:
        return common.fail(f'查询失败：{e}')
