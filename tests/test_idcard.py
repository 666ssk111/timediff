"""身份证解析：GB 11643-1999 校验位 + 信息提取。

11010519491231002X 是一个校验位正确的构造样例（末位校验码为 X）。
"""

VALID_ID = "11010519491231002X"


def test_parse_valid_id(client):
    res = client.post("/idcard/parse", json={"id_number": VALID_ID})
    assert res.status_code == 200
    data = res.get_json()["data"]

    assert data["valid"] is True
    assert data["province"] == "北京市"
    assert data["birthday"] == "1949-12-31"
    assert data["gender"] == "女"          # 第 17 位为偶数
    assert data["zodiac"] == "牛"          # 1949 % 12 == 5
    assert data["constellation"] == "摩羯座"
    assert data["age"] > 70


def test_lowercase_check_digit_is_accepted(client):
    res = client.post("/idcard/parse", json={"id_number": VALID_ID.lower()})
    assert res.get_json()["data"]["valid"] is True


def test_wrong_check_digit_is_reported_but_still_parsed(client):
    """校验位错误时 valid=False，但省份/生日等仍应能解析出来。"""
    res = client.post("/idcard/parse", json={"id_number": "110105194912310021"})
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["valid"] is False
    assert data["birthday"] == "1949-12-31"


def test_rejects_wrong_length(client):
    res = client.post("/idcard/parse", json={"id_number": "12345"})
    assert res.status_code == 400
    assert res.get_json()["message"] == "身份证号码应为 18 位数字或末位 X"


def test_rejects_illegal_birthday(client):
    """月份 13 不合法，应给出明确提示而不是 500。"""
    res = client.post("/idcard/parse", json={"id_number": "11010519491331002X"})
    assert res.status_code == 400
    assert res.get_json()["message"] == "身份证中的出生日期不合法"


def test_rejects_missing_field(client):
    res = client.post("/idcard/parse", json={})
    assert res.status_code == 400
    assert res.get_json()["code"] == 1
