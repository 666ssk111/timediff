# horoscope.py —— 星座运势生成器（确定性随机）
import hashlib
import random
from datetime import date
from flask import Blueprint, request
import common

horoscope_bp = Blueprint('horoscope', __name__, url_prefix='/horoscope')

SIGNS = [
    {'name': '白羊座', 'en': 'aries'},       {'name': '金牛座', 'en': 'taurus'},
    {'name': '双子座', 'en': 'gemini'},      {'name': '巨蟹座', 'en': 'cancer'},
    {'name': '狮子座', 'en': 'leo'},         {'name': '处女座', 'en': 'virgo'},
    {'name': '天秤座', 'en': 'libra'},       {'name': '天蝎座', 'en': 'scorpio'},
    {'name': '射手座', 'en': 'sagittarius'}, {'name': '摩羯座', 'en': 'capricorn'},
    {'name': '水瓶座', 'en': 'aquarius'},    {'name': '双鱼座', 'en': 'pisces'},
]

LUCKY_COLORS = ['红色', '橙色', '黄色', '绿色', '青色', '蓝色', '紫色', '粉色', '白色', '金色']
SUMMARY = ['今日整体运势稳步上扬，重要安排放到上午推进。',
           '整体平稳，按部就班即可，忌冲动决策。',
           '能量充沛的一天，适合主动出击、拓展人际。',
           '状态略有起伏，午后转好，放平心态。']
LOVE = ['桃花运不错，单身者有机会遇到聊得来的人。', '感情需要多一点耐心与倾听。']
CAREER = ['工作中易获认可，适合展示成果。', '合作运佳，团队配合更高效。']
WEALTH = ['偏财运平平，理性消费为上。', '有不错的理财灵感，可小步尝试。']
HEALTH = ['状态良好，注意用眼与久坐。', '适当运动，保证睡眠质量。']


def _rng(sign, day):
    seed = int(hashlib.md5(f'{sign}:{day}'.encode('utf-8')).hexdigest(), 16)
    return random.Random(seed)


@horoscope_bp.route('/daily', methods=['GET'])
def daily():
    try:
        sign = (request.args.get('sign') or '').strip().lower()
        day = request.args.get('date') or str(date.today())
        info = next((s for s in SIGNS if s['en'] == sign), None)
        if not info:
            return common.fail('未知星座')
        r = _rng(sign, day)

        def pick(pool):
            return pool[r.randrange(len(pool))]

        return common.ok({
            'sign': info['name'], 'date': day,
            'overall': r.randint(60, 99), 'love': r.randint(60, 99),
            'career': r.randint(60, 99), 'wealth': r.randint(60, 99),
            'health': r.randint(60, 99),
            'lucky_color': pick(LUCKY_COLORS),
            'lucky_number': r.randint(1, 9),
            'summary': pick(SUMMARY), 'love_text': pick(LOVE),
            'career_text': pick(CAREER), 'wealth_text': pick(WEALTH),
            'health_text': pick(HEALTH),
        })
    except Exception as e:
        return common.fail(f'生成失败：{e}')
