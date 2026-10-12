# common.py —— 所有功能共用：统一响应结构与错误处理
from flask import jsonify, request


def ok(data=None, message='ok'):
    """成功响应：code=0 约定为成功"""
    return jsonify({'code': 0, 'data': data, 'message': message})


def fail(message='请求失败', code=1, http_status=400):
    """失败响应：统一返回 4xx/5xx 状态码 + 业务码"""
    return jsonify({'code': code, 'data': None, 'message': message}), http_status


def openid():
    """从请求头读取用户 openid（云托管会注入 X-WX-OPENID），本地联调回退为 anonymous"""
    return request.headers.get('X-WX-OPENID', 'anonymous')
