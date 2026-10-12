# minesweeper.py —— 扫雷（棋盘生成，首点安全）
import random
from flask import Blueprint, request
import common

mines_bp = Blueprint('minesweeper', __name__, url_prefix='/minesweeper')


@mines_bp.route('/new', methods=['POST'])
def new_board():
    try:
        data = request.get_json(silent=True) or {}
        rows = min(max(int(data.get('rows', 9)), 4), 30)
        cols = min(max(int(data.get('cols', 9)), 4), 30)
        mines = min(max(int(data.get('mines', 10)), 1), rows * cols - 9)
        first_r = int(data.get('first_r', 0))
        first_c = int(data.get('first_c', 0))

        safe = {(first_r + dr, first_c + dc)
                for dr in (-1, 0, 1) for dc in (-1, 0, 1)}
        safe = {(r, c) for r, c in safe if 0 <= r < rows and 0 <= c < cols}
        candidates = [(r, c) for r in range(rows) for c in range(cols)
                      if (r, c) not in safe]
        if mines > len(candidates):
            return common.fail('地雷数量过多')

        bomb_set = set(random.sample(candidates, mines))
        bombs = [{'r': r, 'c': c} for r, c in bomb_set]
        return common.ok({'rows': rows, 'cols': cols, 'mines': mines, 'bombs': bombs})
    except Exception as e:
        return common.fail(f'生成失败：{e}')
