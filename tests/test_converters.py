"""单位换算与进制转换。"""

import pytest


# ---------------------------------------------------------------------------
# /unit/convert
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "category,value,src,dst,expected",
    [
        ("length", 1, "千米", "米", "1000"),
        ("length", 1, "米", "厘米", "100"),
        ("length", 1000, "米", "千米", "1"),
        ("length", 1, "英里", "米", "1609.344"),
        ("weight", 1, "吨", "千克", "1000"),
        ("weight", 1, "斤", "克", "500"),
        ("storage", 1, "KB", "B", "1024"),
        ("storage", 1, "GB", "MB", "1024"),
        ("temperature", 0, "摄氏度", "华氏度", "32"),
        ("temperature", 100, "摄氏度", "华氏度", "212"),
        ("temperature", 0, "摄氏度", "开尔文", "273.15"),
        ("temperature", 32, "华氏度", "摄氏度", "0"),
    ],
)
def test_unit_convert(client, category, value, src, dst, expected):
    res = client.post(
        "/unit/convert",
        json={"category": category, "value": value, "from": src, "to": dst},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["code"] == 0, body
    assert body["data"]["result"] == expected
    assert body["data"]["unit"] == dst


def test_unit_convert_same_unit_is_identity(client):
    res = client.post(
        "/unit/convert",
        json={"category": "length", "value": 7, "from": "米", "to": "米"},
    )
    assert res.get_json()["data"]["result"] == "7"


def test_unit_convert_zero(client):
    res = client.post(
        "/unit/convert",
        json={"category": "length", "value": 0, "from": "米", "to": "千米"},
    )
    assert res.get_json()["data"]["result"] == "0"


def test_unit_convert_rejects_unknown_unit(client):
    res = client.post(
        "/unit/convert",
        json={"category": "length", "value": 1, "from": "光年", "to": "米"},
    )
    assert res.status_code == 400
    assert res.get_json()["message"] == "不支持的单位"


def test_unit_convert_rejects_unknown_category(client):
    res = client.post(
        "/unit/convert",
        json={"category": "nope", "value": 1, "from": "米", "to": "米"},
    )
    assert res.status_code == 400
    assert res.get_json()["code"] == 1


# ---------------------------------------------------------------------------
# /base/convert
# ---------------------------------------------------------------------------

def test_base_convert_decimal_to_hex(client):
    res = client.post("/base/convert", json={"value": "255", "from_base": 10, "to_base": 16})
    assert res.get_json()["data"] == {
        "result": "FF",
        "decimal": "255",
        "binary": "11111111",
        "octal": "377",
        "hex": "FF",
    }


def test_base_convert_hex_to_decimal(client):
    res = client.post("/base/convert", json={"value": "ff", "from_base": 16})
    body = res.get_json()
    assert body["code"] == 0
    # to_base 默认 10，且输入不区分大小写
    assert body["data"]["result"] == "255"
    assert body["data"]["hex"] == "FF"


def test_base_convert_binary_to_octal(client):
    res = client.post("/base/convert", json={"value": "1111", "from_base": 2, "to_base": 8})
    assert res.get_json()["data"]["result"] == "17"


def test_base_convert_negative_number(client):
    res = client.post("/base/convert", json={"value": "-255", "from_base": 10, "to_base": 16})
    assert res.get_json()["data"]["result"] == "-FF"


def test_base_convert_supports_base36(client):
    res = client.post("/base/convert", json={"value": "ZZ", "from_base": 36})
    assert res.get_json()["data"]["result"] == "1295"


def test_base_convert_rejects_out_of_range_base(client):
    res = client.post("/base/convert", json={"value": "10", "from_base": 1})
    assert res.status_code == 400
    assert res.get_json()["message"] == "进制范围应为 2~36"


def test_base_convert_rejects_empty_value(client):
    res = client.post("/base/convert", json={"value": "  ", "from_base": 10})
    assert res.get_json()["message"] == "请输入数值"


def test_base_convert_rejects_digit_outside_base(client):
    """'2' 不是合法的二进制字符，应报非法输入而不是抛异常。"""
    res = client.post("/base/convert", json={"value": "2", "from_base": 2})
    assert res.status_code == 400
    assert "非法输入" in res.get_json()["message"]
