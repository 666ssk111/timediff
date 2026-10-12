"""扫雷棋盘生成：参数钳制与首点安全区。"""


def _new_board(client, **payload):
    res = client.post("/minesweeper/new", json=payload)
    assert res.status_code == 200
    return res.get_json()["data"]


def test_default_board(client):
    data = _new_board(client)
    assert (data["rows"], data["cols"], data["mines"]) == (9, 9, 10)
    assert len(data["bombs"]) == 10


def test_bombs_are_unique_and_inside_board(client):
    data = _new_board(client, rows=12, cols=16, mines=25)
    cells = {(b["r"], b["c"]) for b in data["bombs"]}
    assert len(cells) == 25, "地雷坐标不应重复"
    assert all(0 <= r < 12 and 0 <= c < 16 for r, c in cells)


def test_first_click_area_is_safe(client):
    """首点及其周围 8 格不能有雷。"""
    data = _new_board(client, rows=9, cols=9, mines=10, first_r=4, first_c=4)
    bombs = {(b["r"], b["c"]) for b in data["bombs"]}
    safe = {(4 + dr, 4 + dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1)}
    assert not (bombs & safe)


def test_first_click_at_corner_is_safe(client):
    data = _new_board(client, rows=9, cols=9, mines=10, first_r=0, first_c=0)
    bombs = {(b["r"], b["c"]) for b in data["bombs"]}
    assert not (bombs & {(0, 0), (0, 1), (1, 0), (1, 1)})


def test_parameters_are_clamped_to_sane_range(client):
    data = _new_board(client, rows=1000, cols=1, mines=99999)
    assert data["rows"] == 30          # 上限 30
    assert data["cols"] == 4           # 下限 4
    assert data["mines"] == 30 * 4 - 9  # 上限 rows*cols-9，保证首点安全区放得下
