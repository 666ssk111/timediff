# meme_generator.py —— 表情包生成器（图片 + 上下文字合成，输出 GIF 表情格式）
import base64
import io
from flask import Blueprint, request
import common
from font_util import load_font

meme_bp = Blueprint('meme', __name__, url_prefix='/meme')

try:
    from PIL import Image, ImageDraw, ImageOps
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# 微信个人表情规范：240×240 正方形 GIF
STICKER_SIZE = 240


def _load_image(data):
    if data.get('image_base64'):
        raw = base64.b64decode(data['image_base64'])
        return Image.open(io.BytesIO(raw)).convert('RGB')
    if data.get('image_url'):
        import requests
        return Image.open(io.BytesIO(requests.get(data['image_url'], timeout=8).content)).convert('RGB')
    raise ValueError('缺少图片数据')


def _fit_square(img, size):
    """居中裁剪为正方形并缩放到目标尺寸。"""
    w, h = img.size
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    img = img.crop((left, top, left + s, top + s))
    return img.resize((size, size), Image.LANCZOS)


def _wrap_text(draw, text, font, max_width):
    lines, cur = [], ''
    for ch in text:
        if draw.textlength(cur + ch, font=font) > max_width:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def _draw_caption(draw, text, width, top, font):
    text = (text or '').strip()
    if not text:
        return
    lines = _wrap_text(draw, text, font, width - 16)
    y = top
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        x = (width - (bbox[2] - bbox[0])) // 2
        # 黑描边打底 + 白填充，保证可读性
        draw.text((x, y), line, font=font, fill=(0, 0, 0),
                  stroke_width=2, stroke_fill=(0, 0, 0))
        draw.text((x, y), line, font=font, fill=(255, 255, 255))
        y += (bbox[3] - bbox[1]) + 4


@meme_bp.route('/render', methods=['POST'])
def render():
    if not HAS_PIL:
        return common.fail('未安装 Pillow，请先安装依赖', 503, 503)
    try:
        data = request.get_json(silent=True) or {}
        img = _load_image(data)
        img = ImageOps.exif_transpose(img)
        img = _fit_square(img, STICKER_SIZE)   # 裁剪为 240×240 标准表情尺寸

        w, h = img.size
        draw = ImageDraw.Draw(img)
        font = load_font(max(20, h // 8))
        _draw_caption(draw, data.get('top_text'), w, 6, font)
        _draw_caption(draw, data.get('bottom_text'), w, h - h // 6, font)

        buf = io.BytesIO()
        img.save(buf, format='GIF')            # 输出 GIF，符合微信表情格式
        return common.ok({'image': 'data:image/gif;base64,' +
                          base64.b64encode(buf.getvalue()).decode('ascii')})
    except Exception as e:
        return common.fail(f'生成失败：{e}')
