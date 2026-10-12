# wx_callback.py —— 微信云托管消息推送回调
# 无需 Token 验证，云托管平台已处理鉴权，消息直接 POST 到服务
import json
from flask import Blueprint, request

wx_callback_bp = Blueprint('wx_callback', __name__, url_prefix='')


@wx_callback_bp.route('/wx_callback', methods=['POST'])
def wx_callback():
    """接收微信服务器推送的消息和事件"""
    try:
        data = request.get_json(silent=True)
        if data is None:
            data = request.get_data(as_text=True)

        # 打印接收到的消息日志（云托管日志中可查看）
        print(f'[微信消息推送] 收到消息: {data}')

        # 收到消息后返回 success，否则微信会重试
        return 'success'
    except Exception as e:
        print(f'[微信消息推送] 处理失败: {e}')
        return 'success'  # 仍然返回 success，避免微信无限重试