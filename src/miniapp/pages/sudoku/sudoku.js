// pages/sudoku/sudoku.js —— 数独
const DIFFICULTY = {
  easy:   { name: '简单', blanks: 30 },
  medium: { name: '中等', blanks: 45 },
  hard:   { name: '困难', blanks: 52 },
};

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

Page({
  data: {
    board: [],
    difficulty: 'easy',
    difficultyName: '简单',
    blanks: 0,
    filled: 0,
    errors: 0,
    selectedCell: null,
    status: 'idle',
    elapsed: '00:00',
    showDifficultySelect: true,
    showWin: false,
    winTime: '',
    noteMode: false,
    numButtons: [],
  },

  onLoad() {
    this._solution = [];
    this._history = [];
    this._startTime = 0;
    this._timerId = null;
  },

  onUnload() {
    this._stopTimer();
  },

  // ===================== 难度选择 =====================
  selectDifficulty(e) {
    const d = e.currentTarget.dataset.difficulty;
    const cfg = DIFFICULTY[d];
    this.setData({
      difficulty: d,
      difficultyName: cfg.name,
      blanks: cfg.blanks,
      showDifficultySelect: false,
      selectedCell: null,
      errors: 0,
      filled: 0,
      noteMode: false,
      status: 'playing',
      elapsed: '00:00',
      showWin: false,
    });
    this._history = [];
    this._generatePuzzle(cfg.blanks);
    this._startTimer();
  },

  showMenu() {
    this.setData({ showDifficultySelect: true });
  },

  closeMenu() {
    if (this.data.status !== 'idle') {
      this.setData({ showDifficultySelect: false });
    }
  },

  // ===================== 笔记模式切换 =====================
  onToggleNoteMode() {
    this.setData({ noteMode: !this.data.noteMode });
  },

  // ===================== 数独生成 =====================
  _generatePuzzle(blanks) {
    const solution = this._generateFullBoard();
    this._solution = solution;

    const board = solution.map((row, r) =>
      row.map((val, c) => ({
        value: val,
        notes: [],
        isFixed: true,
        isUser: false,
        isHint: false,
        isConflict: false,
        isEmptyCandidate: false,
        isSelected: false,
        isSameNumber: false,
        row: r,
        col: c,
        row_col: `${r}_${c}`,
      }))
    );

    const cells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        cells.push({ r, c });
      }
    }
    this._shuffle(cells);

    let removed = 0;
    for (const { r, c } of cells) {
      if (removed >= blanks) break;
      const backup = board[r][c].value;
      board[r][c].value = 0;
      board[r][c].isFixed = false;

      const testBoard = board.map(row => row.map(cell => cell.value));
      if (this._countSolutions(testBoard) === 1) {
        removed++;
      } else {
        board[r][c].value = backup;
        board[r][c].isFixed = true;
      }
    }

    this.setData({
      board: board.flat(),
      filled: 0,
      blanks: removed,
      errors: 0,
      numButtons: this._buildNumButtons(board.flat()),
    });

    // 为所有空格生成初始候选数 + 高级过滤
    setTimeout(() => {
      const b = this.data.board.map(c => ({ ...c, notes: [...(c.notes || [])] }));
      this._initAllCandidates(b);
      this._applyAdvancedFilters(b);
      this.setData({ board: b });
    }, 50);
  },

  _generateFullBoard() {
    const board = Array.from({ length: 9 }, () => Array(9).fill(0));
    this._fillBoard(board);
    return board;
  },

  _fillBoard(board) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
          this._shuffle(nums);
          for (const n of nums) {
            if (this._isValid(board, r, c, n)) {
              board[r][c] = n;
              if (this._fillBoard(board)) return true;
              board[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  },

  _isValid(board, row, col, num) {
    for (let c = 0; c < 9; c++) {
      if (board[row][c] === num) return false;
    }
    for (let r = 0; r < 9; r++) {
      if (board[r][col] === num) return false;
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if (board[r][c] === num) return false;
      }
    }
    return true;
  },

  _countSolutions(board) {
    let count = 0;
    const solve = (b) => {
      if (count > 1) return;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (b[r][c] === 0) {
            for (let n = 1; n <= 9; n++) {
              if (this._isValid(b, r, c, n)) {
                b[r][c] = n;
                solve(b);
                b[r][c] = 0;
              }
            }
            return;
          }
        }
      }
      count++;
    };
    solve(board);
    return count;
  },

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  },

  // ===================== 候选数引擎 =====================

  /** 计算单个空格的基础候选数（排除同行/列/宫中已填入的数字） */
  _getCandidates(board, row, col) {
    const used = new Set();
    for (let c = 0; c < 9; c++) {
      if (c !== col) used.add(board[row * 9 + c].value);
    }
    for (let r = 0; r < 9; r++) {
      if (r !== row) used.add(board[r * 9 + col].value);
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if (r !== row || c !== col) used.add(board[r * 9 + c].value);
      }
    }
    const candidates = [];
    for (let n = 1; n <= 9; n++) {
      if (!used.has(n)) candidates.push(n);
    }
    return candidates;
  },

  /** 为所有空格生成初始候选数 */
  _initAllCandidates(board) {
    for (let i = 0; i < 81; i++) {
      if (board[i].value === 0) {
        board[i].notes = this._getCandidates(board, board[i].row, board[i].col);
      }
    }
  },

  /** 高级过滤：Locked Candidates + Naked Pairs（迭代至收敛） */
  _applyAdvancedFilters(board) {
    let changed = true;
    let iter = 0;
    while (changed && iter < 4) {
      changed = false;
      if (this._applyLockedCandidates(board)) changed = true;
      if (this._applyNakedPairs(board)) changed = true;
      iter++;
    }
  },

  /** 刷新指定行/列/宫中所有空格的候选数（用于擦除/撤销后） */
  _refreshCandidatesForRCB(board, row, col) {
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    const visited = new Set();
    // 行
    for (let c = 0; c < 9; c++) {
      const idx = row * 9 + c;
      if (!visited.has(idx) && board[idx].value === 0) {
        board[idx].notes = this._getCandidates(board, board[idx].row, board[idx].col);
        visited.add(idx);
      }
    }
    // 列
    for (let r = 0; r < 9; r++) {
      const idx = r * 9 + col;
      if (!visited.has(idx) && board[idx].value === 0) {
        board[idx].notes = this._getCandidates(board, board[idx].row, board[idx].col);
        visited.add(idx);
      }
    }
    // 宫
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        const idx = r * 9 + c;
        if (!visited.has(idx) && board[idx].value === 0) {
          board[idx].notes = this._getCandidates(board, board[idx].row, board[idx].col);
          visited.add(idx);
        }
      }
    }
    this._applyAdvancedFilters(board);
  },

  /** 区块摒除（Locked Candidates / Pointing）：
   *  若某宫内某数字的所有候选位置都在同一行/列，则该行/列其余位置删去该候选数 */
  _applyLockedCandidates(board) {
    let changed = false;
    for (let br = 0; br < 9; br += 3) {
      for (let bc = 0; bc < 9; bc += 3) {
        for (let n = 1; n <= 9; n++) {
          const positions = [];
          for (let r = br; r < br + 3; r++) {
            for (let c = bc; c < bc + 3; c++) {
              const idx = r * 9 + c;
              if (board[idx].value === 0 && board[idx].notes.includes(n)) {
                positions.push({ r, c });
              }
            }
          }
          if (positions.length === 0) continue;

          // 检查是否所有候选都在同一行
          const sameRow = positions.every(p => p.r === positions[0].r);
          if (sameRow) {
            const row = positions[0].r;
            for (let c = 0; c < 9; c++) {
              if (c >= bc && c < bc + 3) continue;
              const idx = row * 9 + c;
              if (board[idx].value === 0) {
                const ni = board[idx].notes.indexOf(n);
                if (ni >= 0) { board[idx].notes.splice(ni, 1); changed = true; }
              }
            }
          }

          // 检查是否所有候选都在同一列
          const sameCol = positions.every(p => p.c === positions[0].c);
          if (sameCol) {
            const col = positions[0].c;
            for (let r = 0; r < 9; r++) {
              if (r >= br && r < br + 3) continue;
              const idx = r * 9 + col;
              if (board[idx].value === 0) {
                const ni = board[idx].notes.indexOf(n);
                if (ni >= 0) { board[idx].notes.splice(ni, 1); changed = true; }
              }
            }
          }
        }
      }
    }
    return changed;
  },

  /** 数对剔除（Naked Pairs）：
   *  若某行/列/宫中两个空格恰好有相同的两个候选数，则其余空格删去这两个候选数 */
  _applyNakedPairs(board) {
    let changed = false;
    const findPairs = (indices) => {
      const emptyCells = indices.filter(i => board[i].value === 0 && board[i].notes.length === 2);
      for (let i = 0; i < emptyCells.length; i++) {
        for (let j = i + 1; j < emptyCells.length; j++) {
          const a = board[emptyCells[i]].notes;
          const b = board[emptyCells[j]].notes;
          if (a[0] === b[0] && a[1] === b[1]) {
            for (const idx of indices) {
              if (idx === emptyCells[i] || idx === emptyCells[j]) continue;
              if (board[idx].value > 0) continue;
              const ni1 = board[idx].notes.indexOf(a[0]);
              if (ni1 >= 0) { board[idx].notes.splice(ni1, 1); changed = true; }
              const ni2 = board[idx].notes.indexOf(a[1]);
              if (ni2 >= 0) { board[idx].notes.splice(ni2, 1); changed = true; }
            }
          }
        }
      }
    };
    for (let r = 0; r < 9; r++) findPairs(Array.from({ length: 9 }, (_, c) => r * 9 + c));
    for (let c = 0; c < 9; c++) findPairs(Array.from({ length: 9 }, (_, r) => r * 9 + c));
    for (let br = 0; br < 9; br += 3) {
      for (let bc = 0; bc < 9; bc += 3) {
        const indices = [];
        for (let r = br; r < br + 3; r++)
          for (let c = bc; c < bc + 3; c++)
            indices.push(r * 9 + c);
        findPairs(indices);
      }
    }
    return changed;
  },

  _buildNumButtons(board) {
    const buttons = [];
    for (let n = 1; n <= 9; n++) {
      buttons.push({ num: n, completed: this._isNumComplete(board, n) });
    }
    return buttons;
  },

  _isNumComplete(board, n) {
    let count = 0;
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9);
      const c = i % 9;
      if (this._solution[r][c] === n && board[i].value === n) {
        count++;
      }
    }
    return count === 9;
  },

  _updateNumCompletion() {
    const board = this.data.board;
    const numButtons = this.data.numButtons.map(btn => ({
      ...btn,
      completed: this._isNumComplete(board, btn.num),
    }));
    this.setData({ numButtons });
  },

  // ===================== 计时器 =====================
  _startTimer() {
    this._stopTimer();
    this._startTime = Date.now();
    this._timerId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      this.setData({ elapsed: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` });
    }, 1000);
  },

  _stopTimer() {
    if (this._timerId) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  },

  // ===================== 单元格操作 =====================
  onCellTap(e) {
    if (this.data.status !== 'playing') return;
    const row = Number(e.currentTarget.dataset.row);
    const col = Number(e.currentTarget.dataset.col);
    const idx = row * 9 + col;

    const board = this.data.board.map(c => {
      const copy = { ...c };
      copy.notes = [...(c.notes || [])];
      return copy;
    });

    if (this.data.selectedCell) {
      const oldIdx = this.data.selectedCell.row * 9 + this.data.selectedCell.col;
      board[oldIdx].isSelected = false;
    }

    board.forEach(c => { c.isSameNumber = false; });

    board[idx].isSelected = true;
    const selectedValue = board[idx].value;

    if (selectedValue > 0) {
      board.forEach(c => {
        if (c.value === selectedValue && c.value > 0) {
          c.isSameNumber = true;
        }
      });
    }

    this.setData({
      board,
      selectedCell: { row, col },
    });
  },

  onNumberTap(e) {
    if (this.data.status !== 'playing') return;
    if (!this.data.selectedCell) {
      wx.showToast({ title: '请先点击棋盘格子', icon: 'none', duration: 1000 });
      return;
    }

    const num = Number(e.currentTarget.dataset.num);
    const { row, col } = this.data.selectedCell;

    if (this.data.noteMode) {
      this._handleNote(row, col, num);
    } else {
      this._handleFill(row, col, num);
    }
  },

  // ---- 笔记操作 ----
  _handleNote(row, col, num) {
    const idx = row * 9 + col;
    // 深拷贝 board，确保 setData 能检测到引用变化
    const board = this.data.board.map(c => ({ ...c, notes: [...(c.notes || [])] }));
    const cell = board[idx];

    // 已有填入值，拒绝
    if (cell.value > 0) {
      wx.showToast({ title: '请先清空该格', icon: 'none', duration: 1000 });
      return;
    }

    // 笔记是候选数，不限制同行/列/宫中是否已存在该数字
    // 标准数独允许自由添加/移除笔记

    this._history.push({
      type: 'note', row, col,
      oldNotes: [...(cell.notes || [])],
      oldValue: cell.value,
    });

    // 切换笔记
    const noteIdx = cell.notes.indexOf(num);
    if (noteIdx >= 0) {
      cell.notes.splice(noteIdx, 1);
    } else {
      cell.notes.push(num);
      cell.notes.sort((a, b) => a - b);
    }

    board.forEach(c => { c.isConflict = false; });

    // 冲突检测：标记候选数为空的格子
    board.forEach(c => {
      if (c.value === 0 && c.notes.length === 0 && !c.isFixed) {
        c.isEmptyCandidate = true;
      } else {
        c.isEmptyCandidate = false;
      }
    });

    // 全量 setData 确保 WXML 正确渲染（比路径更新更可靠）
    this.setData({ board });
  },

  // ---- 填入操作 ----
  _handleFill(row, col, num) {
    const idx = row * 9 + col;
    const board = this.data.board.map(c => {
      const copy = { ...c };
      copy.notes = [...(c.notes || [])];
      return copy;
    });

    const cell = board[idx];
    if (cell.isFixed) {
      wx.showToast({ title: '初始数字不可修改', icon: 'none', duration: 1000 });
      return;
    }

    board.forEach(c => { c.isConflict = false; });

    const isConflict = !this._isValidForBoard(board, row, col, num);

    const oldValue = cell.value;
    const oldNotes = [...(cell.notes || [])];
    this._history.push({
      type: 'fill',
      row, col,
      oldValue,
      oldNotes,
    });

    cell.value = num;
    cell.isUser = true;
    cell.isHint = false;
    cell.notes = [];
    cell.isConflict = isConflict;

    if (isConflict) {
      this._markConflicts(board, row, col, num);
    }

    // 自动清除同行/列/宫中的笔记数字
    this._autoClearNotes(board, row, col, num);

    // 高级过滤：Locked Candidates + Naked Pairs
    this._applyAdvancedFilters(board);

    // 冲突检测：标记候选数为空的格子
    board.forEach(c => {
      if (c.value === 0 && c.notes.length === 0 && !c.isFixed) {
        c.isEmptyCandidate = true; // 悖论：无候选数，前期逻辑错误
      } else {
        c.isEmptyCandidate = false;
      }
    });

    board.forEach(c => { c.isSameNumber = false; });
    board.forEach(c => {
      if (c.value === num && c.value > 0) {
        c.isSameNumber = true;
      }
    });

    const filled = board.filter(c => c.value > 0 && !c.isFixed).length;
    const newErrors = isConflict ? this.data.errors + 1 : this.data.errors;

    this.setData({
      board,
      filled,
      errors: newErrors,
    });

    this._updateNumCompletion();

    if (!isConflict) {
      this._checkWin(board);
    }
  },

  // 自动清除同行/列/宫中的笔记数字
  _autoClearNotes(board, row, col, num) {
    // 同行
    for (let c = 0; c < 9; c++) {
      if (c !== col) {
        const idx = row * 9 + c;
        const nIdx = board[idx].notes.indexOf(num);
        if (nIdx >= 0) {
          board[idx].notes.splice(nIdx, 1);
        }
      }
    }
    // 同列
    for (let r = 0; r < 9; r++) {
      if (r !== row) {
        const idx = r * 9 + col;
        const nIdx = board[idx].notes.indexOf(num);
        if (nIdx >= 0) {
          board[idx].notes.splice(nIdx, 1);
        }
      }
    }
    // 同宫
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if (r !== row || c !== col) {
          const idx = r * 9 + c;
          const nIdx = board[idx].notes.indexOf(num);
          if (nIdx >= 0) {
            board[idx].notes.splice(nIdx, 1);
          }
        }
      }
    }
  },

  // ===================== 擦除 =====================
  onErase() {
    if (this.data.status !== 'playing') return;
    if (!this.data.selectedCell) return;

    const { row, col } = this.data.selectedCell;
    const idx = row * 9 + col;
    const board = this.data.board.map(c => {
      const copy = { ...c };
      copy.notes = [...(c.notes || [])];
      return copy;
    });
    const cell = board[idx];

    if (cell.isFixed) return;

    // 有填入值 → 擦除值
    if (cell.value > 0) {
      this._history.push({
        type: 'fill',
        row, col,
        oldValue: cell.value,
        oldNotes: [...(cell.notes || [])],
      });
      cell.value = 0;
      cell.isUser = false;
      cell.isHint = false;
      cell.isConflict = false;
    }
    // 有笔记 → 清空笔记
    else if (cell.notes && cell.notes.length > 0) {
      this._history.push({
        type: 'note',
        row, col,
        oldNotes: [...(cell.notes || [])],
        oldValue: 0,
      });
      cell.notes = [];
    }
    // 都没有 → 无事发生
    else {
      return;
    }

    board.forEach(c => { c.isConflict = false; c.isSameNumber = false; });

    // 擦除后重新计算该行/列/宫所有空格的候选数
    this._refreshCandidatesForRCB(board, row, col);

    const filled = board.filter(c => c.value > 0 && !c.isFixed).length;
    this.setData({ board, filled });
    this._updateNumCompletion();
  },

  // ===================== 提示 =====================
  onHint() {
    if (this.data.status !== 'playing') return;
    if (!this.data.selectedCell) {
      wx.showToast({ title: '请先点击棋盘格子', icon: 'none', duration: 1000 });
      return;
    }

    const { row, col } = this.data.selectedCell;
    const idx = row * 9 + col;
    const board = this.data.board.map(c => {
      const copy = { ...c };
      copy.notes = [...(c.notes || [])];
      return copy;
    });
    const cell = board[idx];

    if (cell.isFixed) return;
    if (cell.value > 0) return;

    const correctNum = this._solution[row][col];
    this._history.push({
      type: 'fill',
      row, col,
      oldValue: cell.value,
      oldNotes: [...(cell.notes || [])],
    });
    cell.value = correctNum;
    cell.isUser = true;
    cell.isHint = true;
    cell.notes = [];
    cell.isConflict = false;
    board.forEach(c => { c.isConflict = false; });

    this._autoClearNotes(board, row, col, correctNum);
    this._applyAdvancedFilters(board);

    const filled = board.filter(c => c.value > 0 && !c.isFixed).length;
    this.setData({ board, filled });
    this._updateNumCompletion();

    this._checkWin(board);
  },

  // ===================== 撤销 =====================
  onUndo() {
    if (this.data.status !== 'playing') return;
    if (this._history.length === 0) {
      wx.showToast({ title: '没有可撤销的操作', icon: 'none', duration: 1000 });
      return;
    }

    const last = this._history.pop();
    const idx = last.row * 9 + last.col;
    const board = this.data.board.map(c => {
      const copy = { ...c };
      copy.notes = [...(c.notes || [])];
      return copy;
    });

    board[idx].value = last.oldValue;
    board[idx].isUser = last.oldValue > 0;
    board[idx].isHint = false;
    board[idx].isConflict = false;
    board[idx].notes = [...(last.oldNotes || [])];

    board.forEach(c => { c.isConflict = false; c.isSameNumber = false; });

    const filled = board.filter(c => c.value > 0 && !c.isFixed).length;
    this.setData({ board, filled });
    this._updateNumCompletion();
  },

  // ===================== 重置 =====================
  onReset() {
    if (this.data.status !== 'playing') return;
    wx.showModal({
      title: '重置游戏',
      content: '确定要清空所有已填入的数字和笔记吗？',
      success: (res) => {
        if (res.confirm) {
          const board = this.data.board.map(c => {
            const copy = { ...c };
            copy.notes = [...(c.notes || [])];
            return copy;
          });
          board.forEach(c => {
            if (!c.isFixed) {
              c.value = 0;
              c.isUser = false;
              c.isHint = false;
              c.isConflict = false;
              c.notes = [];
            }
            c.isSelected = false;
            c.isSameNumber = false;
          });
          this._history = [];
          // 重新生成候选数 + 高级过滤
          this._initAllCandidates(board);
          this._applyAdvancedFilters(board);
          this.setData({
            board,
            filled: 0,
            errors: 0,
            selectedCell: null,
            numButtons: this._buildNumButtons(board),
          });
        }
      }
    });
  },

  // ===================== 辅助 =====================
  _isValidForBoard(board, row, col, num) {
    for (let c = 0; c < 9; c++) {
      if (c !== col && board[row * 9 + c].value === num) return false;
    }
    for (let r = 0; r < 9; r++) {
      if (r !== row && board[r * 9 + col].value === num) return false;
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if ((r !== row || c !== col) && board[r * 9 + c].value === num) return false;
      }
    }
    return true;
  },

  _markConflicts(board, row, col, num) {
    for (let c = 0; c < 9; c++) {
      if (c !== col && board[row * 9 + c].value === num) {
        board[row * 9 + c].isConflict = true;
      }
    }
    for (let r = 0; r < 9; r++) {
      if (r !== row && board[r * 9 + col].value === num) {
        board[r * 9 + col].isConflict = true;
      }
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if ((r !== row || c !== col) && board[r * 9 + c].value === num) {
          board[r * 9 + c].isConflict = true;
        }
      }
    }
  },

  _checkWin(board) {
    const allFilled = board.every(c => c.value > 0);
    if (!allFilled) return;

    const hasConflict = board.some(c => c.isConflict);
    if (hasConflict) return;

    const allCorrect = board.every((c, i) => {
      const r = Math.floor(i / 9);
      const col = i % 9;
      return c.value === this._solution[r][col];
    });

    if (allCorrect) {
      this._stopTimer();
      this.setData({
        status: 'won',
        showWin: true,
        winTime: this.data.elapsed,
      });
    }
  },

  onNewGame() {
    this.setData({ showWin: false, showDifficultySelect: true, status: 'idle' });
  },

  noop() {},
});