"""随机决定：抛硬币、转盘、抽签、Excel/Word 导入。"""

import base64
import io


# ---------------------------------------------------------------------------
# 抛硬币 / 转盘 / 抽签
# ---------------------------------------------------------------------------

def test_coin_returns_only_two_outcomes(client):
    seen = set()
    for _ in range(30):
        body = client.post("/random/coin", json={}).get_json()
        assert body["code"] == 0
        assert body["data"]["result"] in ("正面", "反面")
        assert body["data"]["value"] in (0, 1)
        seen.add(body["data"]["result"])
    assert seen <= {"正面", "反面"}


def test_spin_returns_one_of_the_options(client):
    options = ["火锅", "烧烤", "日料"]
    body = client.post("/random/spin", json={"options": options}).get_json()
    assert body["code"] == 0
    assert body["data"]["result"] in options
    assert body["data"]["options"] == options
    assert 0 <= body["data"]["index"] < len(options)


def test_spin_requires_options(client):
    res = client.post("/random/spin", json={"options": []})
    assert res.status_code == 400
    assert res.get_json()["message"] == "请提供选项"


def test_lottery_samples_without_replacement(client):
    options = ["A", "B", "C", "D", "E"]
    body = client.post("/random/lottery", json={"options": options, "count": 3}).get_json()
    results = body["data"]["results"]
    assert len(results) == 3
    assert len(set(results)) == 3, "抽签不应重复"
    assert set(results) <= set(options)


def test_lottery_rejects_count_over_options(client):
    res = client.post("/random/lottery", json={"options": ["A"], "count": 2})
    assert res.status_code == 400
    assert res.get_json()["message"] == "抽签数量超过选项数量"


# ---------------------------------------------------------------------------
# /random/import
# ---------------------------------------------------------------------------

def _xlsx_base64(rows):
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    for index, value in enumerate(rows, start=1):
        ws.cell(row=index, column=1, value=value)
    buf = io.BytesIO()
    wb.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


def test_import_excel_splits_on_comma_and_newline(client):
    payload = _xlsx_base64(["苹果,香蕉", "橘子"])
    body = client.post(
        "/random/import",
        json={"fileData": payload, "fileName": "options.xlsx"},
    ).get_json()

    assert body["code"] == 0
    assert body["data"]["options"] == ["苹果", "香蕉", "橘子"]
    assert body["data"]["count"] == 3
    assert body["data"]["fileName"] == "options.xlsx"


def test_import_excel_deduplicates(client):
    payload = _xlsx_base64(["甲,乙", "甲"])
    body = client.post(
        "/random/import",
        json={"fileData": payload, "fileName": "dup.xlsx"},
    ).get_json()
    assert body["data"]["options"] == ["甲", "乙"]


def test_import_rejects_unsupported_extension(client):
    res = client.post("/random/import", json={"fileData": "eA==", "fileName": "a.txt"})
    assert res.status_code == 400
    assert "不支持的文件类型" in res.get_json()["message"]


def test_import_rejects_missing_payload(client):
    res = client.post("/random/import", json={})
    assert res.status_code == 400
    assert res.get_json()["message"] == "未收到文件内容"


def test_import_rejects_oversized_file(client):
    """超过 5MB 的 base64 内容应被拒绝（这里用 6MB 的假数据）。"""
    payload = base64.b64encode(b"\0" * (6 * 1024 * 1024)).decode()
    res = client.post("/random/import", json={"fileData": payload, "fileName": "big.xlsx"})
    assert res.status_code == 400
    assert res.get_json()["message"] == "文件大小超过 5MB 限制"
