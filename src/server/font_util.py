import os
from PIL import ImageFont

_BASE = os.path.dirname(os.path.abspath(__file__))
_FONTS_DIR = os.path.join(_BASE, 'fonts')

FONT_FAMILIES = {
    'songti': [
        os.path.join(_FONTS_DIR, 'NotoSerifCJKsc-Regular.otf'),
        '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
        '/usr/share/fonts/truetype/arphic/uming.ttc',
        os.path.join(_FONTS_DIR, 'msyh.ttc'),
    ],
    'heiti': [
        os.path.join(_FONTS_DIR, 'NotoSansSC-Regular.ttf'),
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        os.path.join(_FONTS_DIR, 'msyh.ttc'),
    ],
    'kaiti': [
        '/usr/share/fonts/truetype/arphic/ukai.ttc',
        '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
        os.path.join(_FONTS_DIR, 'NotoSerifCJKsc-Regular.otf'),
        os.path.join(_FONTS_DIR, 'msyh.ttc'),
    ],
    'yuanti': [
        os.path.join(_FONTS_DIR, 'NotoSansSC-Regular.ttf'),
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        os.path.join(_FONTS_DIR, 'msyh.ttc'),
    ],
    'times': [
        '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSerif.ttf',
        os.path.join(_FONTS_DIR, 'NotoSerifCJKsc-Regular.otf'),
    ],
}

FONT_NAMES = {
    'songti': '宋体',
    'heiti': '黑体',
    'kaiti': '楷体',
    'yuanti': '圆体',
    'times': 'Times New Roman',
}


def load_font(size, family='songti'):
    """Load font by family name. Falls back through candidates, then to default."""
    paths = FONT_FAMILIES.get(family, FONT_FAMILIES['songti'])
    for path in paths:
        if not os.path.exists(path):
            continue
        try:
            if path.endswith('.ttc'):
                return ImageFont.truetype(path, size, index=0)
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def get_available_families():
    """Return list of font families that have at least one font file on disk."""
    available = []
    for key, paths in FONT_FAMILIES.items():
        for path in paths:
            if os.path.exists(path):
                available.append({'id': key, 'name': FONT_NAMES.get(key, key)})
                break
    return available