# tax_calc.py —— 个税计算器（居民综合所得·累计预扣预缴）
from decimal import Decimal, ROUND_HALF_UP
from flask import Blueprint, request
import common

tax_bp = Blueprint('tax', __name__, url_prefix='/tax')

# 综合所得税率表：(应纳税所得额上限, 税率, 速算扣除数)
BRACKETS = [
    (Decimal('36000'),  Decimal('0.03'), Decimal('0')),
    (Decimal('144000'), Decimal('0.10'), Decimal('2520')),
    (Decimal('300000'), Decimal('0.20'), Decimal('16920')),
    (Decimal('420000'), Decimal('0.25'), Decimal('31920')),
    (Decimal('660000'), Decimal('0.30'), Decimal('52920')),
    (Decimal('960000'), Decimal('0.35'), Decimal('85920')),
    (None,              Decimal('0.45'), Decimal('181920')),
]

# 专项附加扣除每月标准（元）
DEDUCTIONS = {
    'children_edu': Decimal('2000'),
    'infant_care':  Decimal('2000'),
    'elder':        Decimal('3000'),
    'housing_loan': Decimal('1000'),
    'housing_rent': Decimal('1500'),
    'continue_edu': Decimal('400'),
}
BASE = Decimal('5000')   # 基本减除费用（起征点）/月


def _m(x):
    return x.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _bracket(income):
    for limit, rate, quick in BRACKETS:
        if limit is None or income <= limit:
            return rate, quick
    return Decimal('0'), Decimal('0')


def _tax(taxable):
    taxable = max(taxable, Decimal('0'))
    rate, quick = _bracket(taxable)
    return taxable * rate - quick


def _bonus_tax(bonus):
    monthly = bonus / Decimal('12')
    rate, quick = _bracket(monthly)
    return max(bonus * rate - quick, Decimal('0'))


@tax_bp.route('/calc', methods=['POST'])
def calc():
    try:
        data = request.get_json(silent=True) or {}
        monthly_income = Decimal(str(data['monthly_income']))
        social = Decimal(str(data.get('social_insurance', '0')))
        deduction = Decimal(str(data.get('special_deduction', '0')))
        months = int(data.get('months', '12'))
        bonus = Decimal(str(data.get('annual_bonus', '0')))

        cumulative_income = monthly_income * months
        taxable = cumulative_income - (BASE + social + deduction) * months
        tax = _tax(taxable)
        bonus_tax = _bonus_tax(bonus) if bonus > 0 else Decimal('0')
        rate, _ = _bracket(max(taxable, Decimal('0')))

        return common.ok({
            'taxable_income': str(_m(taxable)),
            'tax': str(_m(tax)),
            'tax_rate': str(rate),
            'take_home': str(_m(monthly_income - social - tax / months)),
            'annual_bonus_tax': str(_m(bonus_tax)),
        })
    except Exception as e:
        return common.fail(f'参数错误：{e}')
