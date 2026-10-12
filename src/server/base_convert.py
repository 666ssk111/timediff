# base_convert.py —— 进制转换（2~36 进制任意互转）
from flask import Blueprint, request
import common

base_bp = Blueprint('base', __name__, url_prefix='/base')
DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'


def to_base(n, base):
    """十进制整数转任意进制字符串，支持负数与大整数。"""
    if n == 0:
        return '0'
    sign = '-' if n < 0 else ''
    n = abs(n)
    out = []
    while n > 0:
        n, r = divmod(n, base)
        out.append(DIGITS[r])
    return sign + ''.join(reversed(out))


def from_base(s, base):
    """任意进制字符串转十进制整数。"""
    s = s.strip().upper().lstrip('-')
    result = 0
    for ch in s:
        v = DIGITS.index(ch)
        if v >= base:
            raise ValueError(f'字符 {ch} 超出 {base} 进制范围')
        result = result * base + v
    return result


@base_bp.route('/convert', methods=['POST'])
def convert():
    try:
        data = request.get_json(silent=True) or {}
        value_str = str(data['value']).strip()
        src_base = int(data['from_base'])
        dst_base = int(data.get('to_base', 10))
        if not (2 <= src_base <= 36 and 2 <= dst_base <= 36):
            return common.fail('进制范围应为 2~36')
        if not value_str:
            return common.fail('请输入数值')

        negative = value_str.startswith('-')
        n = from_base(value_str, src_base)
        n = -n if negative else n

        return common.ok({
            'result': to_base(n, dst_base),
            'decimal': str(n),
            'binary': to_base(n, 2),
            'octal': to_base(n, 8),
            'hex': to_base(n, 16),
        })
    except ValueError as e:
        return common.fail(f'非法输入：{e}')
    except Exception as e:
        return common.fail(f'转换失败：{e}')
