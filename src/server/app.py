# app.py —— 保留日期计算，统一挂载所有功能蓝图
import os
from flask import Flask, request
from datetime import datetime

import common
import db
from mortgage import mortgage_bp
from tax_calc import tax_bp
from unit_convert import unit_bp
from base_convert import base_bp
from id_card import idcard_bp
from account import account_bp
from todo import todo_bp
from habit import habit_bp
from history_today import history_bp
from ocr_translate import ocr_bp, tmt_bp
from avatar_wallpaper import avatar_bp
from meme_generator import meme_bp
from horoscope import horoscope_bp
from random_decide import random_bp
from minesweeper import mines_bp
from snake import snake_bp
from feedback import feedback_bp
from notify import notify_bp
from wx_callback import wx_callback_bp

app = Flask(__name__)
app.json.ensure_ascii = False

# 每个请求结束后自动关闭 MySQL 连接
app.teardown_appcontext(db.close_db)


# 跨域支持：微信开发者工具基于 Chromium，wx.request 受 CORS 限制
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response


@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response


@app.route('/', methods=['GET'])
def index():
    """根路径健康检查，方便确认服务已部署运行"""
    return common.ok({'service': 'miniapp-tools', 'status': 'running', 'message': '工具箱后端服务运行中'})


@app.route('/health', methods=['GET'])
def health():
    return common.ok({'status': 'ok'})


@app.route('/calculate_days', methods=['POST'])
def calculate_days():
    try:
        data = request.get_json()
        start = datetime.strptime(data['start_date'], '%Y-%m-%d')
        end = datetime.strptime(data['end_date'], '%Y-%m-%d')
        days = abs((end - start).days)
        return common.ok({'days': days}, f'已过去 {days} 天')
    except Exception as e:
        return common.fail(f'计算失败：{e}')


# 统一 404 与 500 处理，保证任何异常都返回 JSON 而非 HTML
@app.errorhandler(404)
def not_found(e):
    return common.fail('接口不存在', 404, 404)


@app.errorhandler(Exception)
def server_error(e):
    return common.fail(f'服务器内部错误：{e}', 500, 500)


# 注册全部功能蓝图
for bp in (mortgage_bp, tax_bp, unit_bp, base_bp, idcard_bp,
           account_bp, todo_bp, habit_bp, history_bp, ocr_bp, tmt_bp,
           avatar_bp, meme_bp, horoscope_bp, random_bp, mines_bp, snake_bp,
           feedback_bp, notify_bp, wx_callback_bp):
    app.register_blueprint(bp)


if __name__ == '__main__':
    # 本地联调默认 3000，云托管由 gunicorn 监听 80 端口
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port)
