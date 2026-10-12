"""房贷计算器与个税计算器。

这两个模块是纯 Decimal 运算，结果完全确定，因此可以直接断言精确值。
"""


# ---------------------------------------------------------------------------
# /mortgage/calc
# ---------------------------------------------------------------------------

def _mortgage(client, **payload):
    body = {"principal": 1_000_000, "years": 30, "annual_rate": 3.5}
    body.update(payload)
    res = client.post("/mortgage/calc", json=body)
    assert res.status_code == 200
    return res.get_json()


def test_equal_payment_basic_shape(client):
    body = _mortgage(client, method="equal_payment")
    assert body["code"] == 0
    data = body["data"]

    assert data["months"] == 360
    assert len(data["schedule"]) == 360

    monthly = float(data["monthly_payment"])
    # 100 万 / 30 年 / 3.5% 的等额本息月供约 4490 元
    assert 4400 < monthly < 4600

    interest = float(data["total_interest"])
    assert interest > 0
    assert abs(float(data["total_payment"]) - (1_000_000 + interest)) < 1


def test_equal_payment_balance_reaches_zero(client):
    data = _mortgage(client, method="equal_payment")["data"]
    assert float(data["schedule"][-1]["balance"]) == 0
    # 最后一期的还款额与首期一致（等额本息月供固定）
    assert data["schedule"][0]["payment"] == data["schedule"][-1]["payment"]


def test_equal_principal_decreases_over_time(client):
    data = _mortgage(client, method="equal_principal")["data"]
    payments = [float(row["payment"]) for row in data["schedule"]]

    assert len(payments) == 360
    assert payments[0] > payments[-1]
    # 等额本金首月还款 = 本金均摊 + 首月利息，必然高于等额本息月供
    equal_payment_monthly = float(_mortgage(client, method="equal_payment")["data"]["monthly_payment"])
    assert payments[0] > equal_payment_monthly


def test_equal_principal_total_interest_lower_than_equal_payment(client):
    a = float(_mortgage(client, method="equal_principal")["data"]["total_interest"])
    b = float(_mortgage(client, method="equal_payment")["data"]["total_interest"])
    assert a < b


def test_default_method_is_equal_payment(client):
    without_method = _mortgage(client)["data"]
    explicit = _mortgage(client, method="equal_payment")["data"]
    assert without_method["monthly_payment"] == explicit["monthly_payment"]


def test_zero_rate_is_treated_as_missing(client):
    """源码用 `data.get('annual_rate') or DEFAULT_LPR` 取值，0 是假值，
    因此传 annual_rate=0 实际会回退到默认 LPR。这里把这个行为钉住，
    一旦以后改成真正的 0 利率，这条测试会失败并提醒同步更新文档。
    """
    with_zero = _mortgage(client, annual_rate=0)["data"]
    default = _mortgage(client)["data"]
    assert with_zero["monthly_payment"] == default["monthly_payment"]
    assert with_zero["total_interest"] == default["total_interest"]


def test_equal_payment_handles_zero_rate_internally():
    """API 层走不到 r == 0 的分支，直接调内部函数确认它不会除零。"""
    from decimal import Decimal

    from mortgage import _equal_payment

    monthly, interest, total, schedule = _equal_payment(Decimal("120000"), Decimal("0"), 12)

    assert monthly == Decimal("10000.00")
    assert interest == Decimal("0.00")
    assert total == Decimal("120000.00")
    assert len(schedule) == 12


def test_mortgage_rejects_invalid_parameters(client):
    for payload in (
        {"principal": 0, "years": 30},
        {"principal": -1, "years": 30},
        {"principal": 1_000_000, "years": 0},
        {"principal": 1_000_000, "years": 51},
    ):
        res = client.post("/mortgage/calc", json=payload)
        assert res.status_code == 400, payload
        assert res.get_json()["message"] == "贷款参数不合法"


# ---------------------------------------------------------------------------
# /tax/calc
# ---------------------------------------------------------------------------

def test_tax_calc_exact_values(client):
    """月薪 2 万、社保 2 千、专项附加 1 千，全年应纳税所得额 144000。"""
    res = client.post(
        "/tax/calc",
        json={
            "monthly_income": 20000,
            "social_insurance": 2000,
            "special_deduction": 1000,
            "months": 12,
        },
    )
    assert res.status_code == 200
    data = res.get_json()["data"]

    # 240000 - (5000 + 2000 + 1000) * 12 = 144000
    assert data["taxable_income"] == "144000.00"
    # 144000 * 10% - 2520 = 11880
    assert data["tax"] == "11880.00"
    assert data["tax_rate"] == "0.10"
    # 20000 - 2000 - 11880 / 12 = 17010
    assert data["take_home"] == "17010.00"
    assert data["annual_bonus_tax"] == "0.00"


def test_tax_calc_below_threshold_has_no_tax(client):
    res = client.post("/tax/calc", json={"monthly_income": 5000, "months": 12})
    data = res.get_json()["data"]
    assert data["taxable_income"] == "0.00"
    assert data["tax"] == "0.00"
    assert data["take_home"] == "5000.00"


def test_tax_calc_annual_bonus_separate_rate(client):
    """年终奖 36000 元单独计税：36000/12 = 3000，适用 3% 档。"""
    res = client.post(
        "/tax/calc",
        json={"monthly_income": 20000, "annual_bonus": 36000},
    )
    assert res.get_json()["data"]["annual_bonus_tax"] == "1080.00"


def test_tax_calc_rejects_missing_income(client):
    res = client.post("/tax/calc", json={})
    assert res.status_code == 400
    assert "参数错误" in res.get_json()["message"]
