# unit_convert.py —— 单位换算（基准单位桥接）
from decimal import Decimal
from flask import Blueprint, request
import common

unit_bp = Blueprint('unit', __name__, url_prefix='/unit')

# 每类单位：名称 -> (相对基准单位的因子, 温度偏移标记)
UNITS = {
    'length': {'米': ('1', None), '千米': ('1000', None), '厘米': ('0.01', None),
               '毫米': ('0.001', None), '英里': ('1609.344', None),
               '英尺': ('0.3048', None), '英寸': ('0.0254', None)},
    'weight': {'千克': ('1', None), '克': ('0.001', None), '吨': ('1000', None),
               '斤': ('0.5', None), '磅': ('0.45359237', None)},
    'storage': {'B': ('1', None), 'KB': ('1024', None), 'MB': ('1048576', None),
                'GB': ('1073741824', None), 'TB': ('1099511627776', None)},
    'temperature': {'摄氏度': (None, 'c'), '华氏度': (None, 'f'), '开尔文': (None, 'k')},
}


def _to_celsius(value, mark):
    if mark == 'c':
        return value
    if mark == 'f':
        return (value - Decimal('32')) * Decimal('5') / Decimal('9')
    return value - Decimal('273.15')


def _from_celsius(value, mark):
    if mark == 'c':
        return value
    if mark == 'f':
        return value * Decimal('9') / Decimal('5') + Decimal('32')
    return value + Decimal('273.15')


def _fmt(d):
    """格式化结果：去掉科学计数法与多余尾随零。"""
    d = d.quantize(Decimal('0.0000000001')).normalize()
    s = format(d, 'f')
    return s.rstrip('0').rstrip('.') if '.' in s else s


@unit_bp.route('/convert', methods=['POST'])
def convert():
    try:
        data = request.get_json(silent=True) or {}
        category, value = data['category'], Decimal(str(data['value']))
        src, dst = data['from'], data['to']
        units = UNITS[category]
        if src not in units or dst not in units:
            return common.fail('不支持的单位')

        if category == 'temperature':
            result = _from_celsius(_to_celsius(value, units[src][1]), units[dst][1])
        else:
            result = value * Decimal(units[src][0]) / Decimal(units[dst][0])

        return common.ok({'result': _fmt(result), 'unit': dst})
    except Exception as e:
        return common.fail(f'换算失败：{e}')
