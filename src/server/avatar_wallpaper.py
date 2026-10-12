# avatar_wallpaper.py —— 壁纸/头像制作（模板数据 + Pillow 服务端渲染）
import base64
import io
from flask import Blueprint, request
import common
from font_util import load_font, get_available_families

avatar_bp = Blueprint('avatar', __name__, url_prefix='/avatar')

try:
    from PIL import Image, ImageDraw
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

TEMPLATES = [
    {'id': 'dawn',   'colors': ['#f7971e', '#ffd200'], 'quote': '向阳而生'},
    {'id': 'ocean',  'colors': ['#2193b0', '#6dd5ed'], 'quote': '心若止水'},
    {'id': 'forest', 'colors': ['#11998e', '#38ef7d'], 'quote': '生生不息'},
    {'id': 'night',  'colors': ['#0f2027', '#2c5364'], 'quote': '仰望星空'},
    {'id': 'rose',   'colors': ['#ff6b6b', '#ff6b6b'], 'quote': '热爱可抵岁月漫长'},
    {'id': 'sunset', 'colors': ['#ee9ca7', '#ffdde1'], 'quote': '不负韶华'},
]


def _hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _gradient_bg(w, h, c1, c2):
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(c1[0] + (c2[0] - c1[0]) * t)
        g = int(c1[1] + (c2[1] - c1[1]) * t)
        b = int(c1[2] + (c2[2] - c1[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def _wrap_text(draw, text, font, max_width):
    """按最大宽度自动换行，并支持显式 \n 换行。"""
    lines = []
    for para in text.split('\n'):
        para = para.rstrip()
        if para == '':
            lines.append('')
            continue
        cur = ''
        for ch in para:
            test = cur + ch
            if draw.textlength(test, font=font) <= max_width:
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = ch
        lines.append(cur)
    return lines


def _fit_font_and_lines(draw, text, max_width, max_height, start_size, family='songti'):
    """根据文本长度与可用空间，自适应缩小字号并返回 (字体, 分行列表)。"""
    size = start_size
    while size > 16:
        font = load_font(size, family=family)
        lines = _wrap_text(draw, text, font, max_width)
        line_height = int(size * 1.5)
        if line_height * len(lines) <= max_height:
            return font, lines, line_height
        size -= 4
    font = load_font(size, family=family)
    lines = _wrap_text(draw, text, font, max_width)
    return font, lines, int(size * 1.5)


@avatar_bp.route('/fonts', methods=['GET'])
def fonts():
    return common.ok({'fonts': get_available_families()})


@avatar_bp.route('/templates', methods=['GET'])
def templates():
    return common.ok({'templates': TEMPLATES})


@avatar_bp.route('/render', methods=['POST'])
def render():
    if not HAS_PIL:
        return common.fail('未安装 Pillow，请先安装依赖', 503, 503)
    try:
        data = request.get_json(silent=True) or {}
        width = min(max(int(data.get('width', 750)), 100), 2000)
        height = min(max(int(data.get('height', 1334)), 100), 3000)
        tpl_id = data.get('template', 'dawn')
        tpl = next((t for t in TEMPLATES if t['id'] == tpl_id), TEMPLATES[0])
        colors = data.get('colors') or tpl['colors']
        font = data.get('font', 'songti')
        # 用户输入文本优先，留空才使用模板默认文案
        quote = data.get('quote')
        if quote is None or not str(quote).strip():
            quote = tpl['quote']
        quote = str(quote).strip()

        c1 = _hex_to_rgb(colors[0])
        c2 = _hex_to_rgb(colors[1]) if len(colors) > 1 else c1
        img = _gradient_bg(width, height, c1, c2)

        if quote:
            draw = ImageDraw.Draw(img)
            max_w = int(width * 0.85)
            max_h = int(height * 0.7)
            font, lines, line_height = _fit_font_and_lines(
                draw, quote, max_w, max_h, start_size=height // 12, family=font)

            # 计算整体文本块高度并垂直居中
            total_h = line_height * len(lines)
            y = (height - total_h) // 2

            for line in lines:
                bbox = draw.textbbox((0, 0), line, font=font)
                tw = bbox[2] - bbox[0]
                x = (width - tw) // 2
                # 阴影 + 白字，保证在任意渐变背景上清晰
                shadow_off = max(2, font.size // 24)
                draw.text((x + shadow_off, y + shadow_off), line,
                          font=font, fill=(0, 0, 0))
                draw.text((x, y), line, font=font, fill=(255, 255, 255),
                          stroke_width=0)
                y += line_height

        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return common.ok({'image': 'data:image/png;base64,' +
                          base64.b64encode(buf.getvalue()).decode('ascii')})
    except Exception as e:
        return common.fail(f'渲染失败：{e}')
