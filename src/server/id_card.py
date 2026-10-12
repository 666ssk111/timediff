# id_card.py —— 身份证号码解析（GB 11643-1999 校验 + 信息提取）
import re
from datetime import datetime
from flask import Blueprint, request
import common

idcard_bp = Blueprint('idcard', __name__, url_prefix='/idcard')

PROVINCES = {
    '11': '北京市', '12': '天津市', '13': '河北省', '14': '山西省', '15': '内蒙古自治区',
    '21': '辽宁省', '22': '吉林省', '23': '黑龙江省', '31': '上海市', '32': '江苏省',
    '33': '浙江省', '34': '安徽省', '35': '福建省', '36': '江西省', '37': '山东省',
    '41': '河南省', '42': '湖北省', '43': '湖南省', '44': '广东省', '45': '广西壮族自治区',
    '46': '海南省', '50': '重庆市', '51': '四川省', '52': '贵州省', '53': '云南省',
    '54': '西藏自治区', '61': '陕西省', '62': '甘肃省', '63': '青海省',
    '64': '宁夏回族自治区', '65': '新疆维吾尔自治区', '71': '台湾省',
    '81': '香港特别行政区', '82': '澳门特别行政区',
}
WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
CHECK_CODES = '10X98765432'
ZODIAC = ['猴', '鸡', '狗', '猪', '鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊']
CONSTELLATION_STARTS = [
    ((1, 20), '水瓶座'), ((2, 19), '双鱼座'), ((3, 21), '白羊座'),
    ((4, 20), '金牛座'), ((5, 21), '双子座'), ((6, 22), '巨蟹座'),
    ((7, 23), '狮子座'), ((8, 23), '处女座'), ((9, 23), '天秤座'),
    ((10, 24), '天蝎座'), ((11, 23), '射手座'), ((12, 22), '摩羯座'),
]
ID_RE = re.compile(r'^\d{17}[\dXx]$')


def _validate(id_no):
    total = sum(int(id_no[i]) * WEIGHTS[i] for i in range(17))
    return CHECK_CODES[total % 11] == id_no[17]


def _constellation(month, day):
    date = (month, day)
    result = CONSTELLATION_STARTS[-1][1]
    for start, name in CONSTELLATION_STARTS:
        if date >= start:
            result = name
    return result


@idcard_bp.route('/parse', methods=['POST'])
def parse():
    try:
        data = request.get_json(silent=True) or {}
        id_no = (data.get('id_number') or '').strip().upper()
        if not ID_RE.match(id_no):
            return common.fail('身份证号码应为 18 位数字或末位 X')
        valid = _validate(id_no)
        year, month, day = int(id_no[6:10]), int(id_no[10:12]), int(id_no[12:14])
        try:
            birthday = datetime(year, month, day)
        except ValueError:
            return common.fail('身份证中的出生日期不合法')
        age = (datetime.now() - birthday).days // 365

        return common.ok({
            'valid': valid,
            'province': PROVINCES.get(id_no[:2], '未知'),
            'birthday': f'{year:04d}-{month:02d}-{day:02d}',
            'age': age,
            'gender': '男' if int(id_no[16]) % 2 == 1 else '女',
            'zodiac': ZODIAC[year % 12],
            'constellation': _constellation(month, day),
        })
    except Exception as e:
        return common.fail(f'解析失败：{e}')
