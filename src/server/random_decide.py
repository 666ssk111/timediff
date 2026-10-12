# random_decide.py —— 随机决定（抛硬币/转盘/抽签）+ Excel/Word 导入
import secrets
import os
import tempfile
import base64
from flask import Blueprint, request
import common

random_bp = Blueprint('random', __name__, url_prefix='/random')


@random_bp.route('/coin', methods=['POST'])
def coin():
    v = secrets.randbelow(2)
    return common.ok({'value': v, 'result': '正面' if v == 0 else '反面'})


@random_bp.route('/spin', methods=['POST'])
def spin():
    data = request.get_json(silent=True) or {}
    options = data.get('options') or []
    if not options:
        return common.fail('请提供选项')
    idx = secrets.randbelow(len(options))
    return common.ok({'index': idx, 'result': options[idx], 'options': options})


@random_bp.route('/lottery', methods=['POST'])
def lottery():
    data = request.get_json(silent=True) or {}
    options = data.get('options') or []
    count = int(data.get('count', 1))
    if not options or count < 1:
        return common.fail('参数不合法')
    if count > len(options):
        return common.fail('抽签数量超过选项数量')
    picked = secrets.SystemRandom().sample(options, count)
    return common.ok({'results': picked})


# ---------- 文件导入 ----------
ALLOWED_EXT = {'xlsx', 'xls', 'docx', 'doc'}
MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB


def _parse_excel(filepath):
    """解析 Excel 文件，提取所有 sheet 第一列的非空内容作为选项。
       每个单元格内容按逗号/换行切分后合并。"""
    try:
        import openpyxl
    except ImportError:
        return None, '服务器未安装 Excel 解析库'
    try:
        wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
        items = []
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            for row in ws.iter_rows(min_col=1, max_col=1, values_only=True):
                cell = row[0]
                if cell is None:
                    continue
                text = str(cell).strip()
                if not text:
                    continue
                # 按逗号/换行拆分
                for part in _split_options(text):
                    if part not in items:
                        items.append(part)
        wb.close()
        return items, None
    except Exception as e:
        return None, f'Excel 解析失败：{e}'


def _parse_word(filepath):
    """解析 Word 文档，提取所有段落中的选项。"""
    try:
        import docx
    except ImportError:
        return None, '服务器未安装 Word 解析库'
    try:
        doc = docx.Document(filepath)
        items = []
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            for part in _split_options(text):
                if part not in items:
                    items.append(part)
        return items, None
    except Exception as e:
        return None, f'Word 解析失败：{e}'


def _split_options(text):
    """将文本按逗号、中文逗号、换行符拆分为选项列表。"""
    parts = []
    # 先按换行拆分
    for line in text.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        line = line.strip()
        if not line:
            continue
        # 再按逗号拆分
        for seg in line.replace('，', ',').split(','):
            seg = seg.strip()
            if seg:
                parts.append(seg)
    return parts


@random_bp.route('/import', methods=['POST'])
def import_file():
    """接收前端上传的 base64 文件，解析后返回选项列表。"""
    try:
        data = request.get_json(silent=True) or {}
        file_data = data.get('fileData') or data.get('file_data') or ''
        file_name = data.get('fileName') or data.get('file_name') or 'unknown'

        if not file_data:
            return common.fail('未收到文件内容')

        # 校验文件扩展名
        ext = file_name.rsplit('.', 1)[-1].lower() if '.' in file_name else ''
        if ext not in ALLOWED_EXT:
            return common.fail(f'不支持的文件类型 .{ext}，请上传 Excel (.xlsx/.xls) 或 Word (.docx/.doc) 文档')

        # 解码 base64
        try:
            raw = base64.b64decode(file_data)
        except Exception:
            return common.fail('文件内容解码失败，请重新选择文件')

        if len(raw) > MAX_FILE_BYTES:
            return common.fail('文件大小超过 5MB 限制')

        # 写入临时文件
        suffix = f'.{ext}'
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(raw)

            # 解析
            if ext in ('xlsx', 'xls'):
                items, err = _parse_excel(tmp_path)
            else:
                items, err = _parse_word(tmp_path)

            if err:
                return common.fail(err)
            if not items:
                return common.fail('文档中未找到有效选项，请确保内容用逗号或换行分隔')

            return common.ok({
                'options': items,
                'count': len(items),
                'fileName': file_name,
            })
        finally:
            # 清理临时文件
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    except Exception as e:
        return common.fail(f'导入失败：{e}')