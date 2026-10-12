# mortgage.py —— 房贷计算器（等额本息 / 等额本金）
from decimal import Decimal, ROUND_HALF_UP
from flask import Blueprint, request
import common

mortgage_bp = Blueprint('mortgage', __name__, url_prefix='/mortgage')
DEFAULT_LPR = Decimal('3.5')   # 五年期以上 LPR，建议放环境变量便于更新


def _m(x):
    """金额四舍五入到分"""
    return x.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _equal_payment(p, r, n):
    """等额本息：M = p·r·(1+r)^n / ((1+r)^n - 1)，每月月供固定。"""
    if r == 0:
        return _equal_principal(p, Decimal('0'), n)
    factor = (Decimal('1') + r) ** n
    monthly = _m(p * r * factor / (factor - Decimal('1')))
    balance, interest_total, schedule = p, Decimal('0'), []
    for i in range(1, n + 1):
        interest = _m(balance * r)
        principal_paid = _m(monthly - interest)
        balance = _m(balance - principal_paid)
        interest_total += interest
        schedule.append({'month': i, 'payment': str(monthly),
                         'principal': str(principal_paid),
                         'interest': str(interest),
                         'balance': str(balance if balance > 0 else Decimal('0'))})
    return monthly, _m(interest_total), _m(p + interest_total), schedule


def _equal_principal(p, r, n):
    """等额本金：本金逐月均摊，利息随剩余本金递减。"""
    principal_per = _m(p / Decimal(n))
    balance, interest_total, schedule, first = p, Decimal('0'), [], None
    for i in range(1, n + 1):
        interest = _m(balance * r)
        payment = _m(principal_per + interest)
        if first is None:
            first = payment
        balance = _m(balance - principal_per)
        interest_total += interest
        schedule.append({'month': i, 'payment': str(payment),
                         'principal': str(principal_per),
                         'interest': str(interest),
                         'balance': str(balance if balance > 0 else Decimal('0'))})
    return first, _m(interest_total), _m(p + interest_total), schedule


@mortgage_bp.route('/calc', methods=['POST'])
def calc():
    try:
        data = request.get_json(silent=True) or {}
        principal = Decimal(str(data['principal']))
        years = int(data['years'])
        annual_rate = Decimal(str(data.get('annual_rate') or DEFAULT_LPR))
        method = data.get('method', 'equal_payment')
        if years <= 0 or years > 50 or principal <= 0:
            return common.fail('贷款参数不合法')
        months = years * 12
        monthly_rate = annual_rate / Decimal('100') / Decimal('12')

        fn = _equal_payment if method == 'equal_payment' else _equal_principal
        monthly, total_interest, total_pay, schedule = fn(principal, monthly_rate, months)

        return common.ok({
            'monthly_payment': str(monthly),
            'total_interest': str(total_interest),
            'total_payment': str(total_pay),
            'months': months,
            'schedule': schedule,
        })
    except Exception as e:
        return common.fail(f'参数错误：{e}')
