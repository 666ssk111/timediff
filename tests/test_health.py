"""健康检查、日期计算、统一错误响应与 CORS。"""


def test_root_reports_running(client):
    res = client.get("/")
    assert res.status_code == 200
    body = res.get_json()
    assert body["code"] == 0
    assert body["data"]["status"] == "running"
    assert body["data"]["service"] == "miniapp-tools"


def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.get_json() == {"code": 0, "data": {"status": "ok"}, "message": "ok"}


def test_cors_headers_are_set(client):
    """微信开发者工具基于 Chromium，wx.request 需要 CORS 头。"""
    res = client.get("/health")
    assert res.headers["Access-Control-Allow-Origin"] == "*"
    assert "POST" in res.headers["Access-Control-Allow-Methods"]


def test_preflight_options_short_circuits(client):
    res = client.options("/calculate_days")
    assert res.status_code == 200
    assert res.headers["Access-Control-Allow-Origin"] == "*"


def test_calculate_days_forward(client):
    res = client.post(
        "/calculate_days",
        json={"start_date": "2024-01-01", "end_date": "2024-01-31"},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["code"] == 0
    assert body["data"]["days"] == 30
    assert "30" in body["message"]


def test_calculate_days_is_order_independent(client):
    """日期先后颠倒也应返回正数（源码里用了 abs）。"""
    res = client.post(
        "/calculate_days",
        json={"start_date": "2024-01-31", "end_date": "2024-01-01"},
    )
    assert res.get_json()["data"]["days"] == 30


def test_calculate_days_rejects_bad_date(client):
    res = client.post(
        "/calculate_days",
        json={"start_date": "not-a-date", "end_date": "2024-01-31"},
    )
    assert res.status_code == 400
    body = res.get_json()
    assert body["code"] == 1
    assert body["data"] is None
    assert "计算失败" in body["message"]


def test_unknown_route_returns_json_not_html(client):
    """统一 404 处理：任何异常都返回 JSON。"""
    res = client.get("/definitely-not-a-route")
    assert res.status_code == 404
    assert res.is_json
    assert res.get_json()["message"] == "接口不存在"
