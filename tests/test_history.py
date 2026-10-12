"""历史上的今天：白名单查询与合规兜底。"""


def test_known_date_returns_items_sorted_by_year_desc(client):
    res = client.get("/history/today?month=10&day=1")
    assert res.status_code == 200
    body = res.get_json()

    assert body["code"] == 0
    assert body["data"]["date"] == "10-01"
    assert body["data"]["count"] >= 1

    years = [item["year"] for item in body["data"]["items"]]
    assert years == sorted(years, reverse=True)
    for item in body["data"]["items"]:
        assert item["year"] and item["title"] and item["desc"]


def test_month_and_day_are_zero_padded(client):
    res = client.get("/history/today?month=1&day=1")
    assert res.get_json()["data"]["date"] == "01-01"


def test_unknown_date_returns_business_code_not_http_error(client):
    """数据缺失属于业务态：HTTP 200 + code=2。"""
    res = client.get("/history/today?month=2&day=30")
    assert res.status_code == 200
    body = res.get_json()
    assert body["code"] == 2
    assert body["data"] is None
    assert body["message"] == "抱歉，此事件无法查询"


def test_defaults_to_today_without_arguments(client):
    res = client.get("/history/today")
    assert res.status_code == 200
    assert res.get_json()["code"] in (0, 2)


def test_invalid_month_is_handled_gracefully(client):
    res = client.get("/history/today?month=abc&day=1")
    assert res.status_code == 400
    assert res.get_json()["code"] == 1
