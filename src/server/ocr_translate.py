# ocr_translate.py —— 文字识别(OCR)与机器翻译（腾讯云 SDK，可选依赖）
import os
import re
import functools
from flask import Blueprint, request
import common

ocr_bp = Blueprint('ocr', __name__, url_prefix='/ocr')
tmt_bp = Blueprint('tmt', __name__, url_prefix='/tmt')

# 可选依赖：未安装 tencentcloud-sdk-python 时服务仍可启动，仅相关接口返回未配置
try:
    from tencentcloud.common import credential
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile
    from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
    from tencentcloud.ocr.v20181119 import ocr_client, models as ocr_models
    from tencentcloud.tmt.v20180321 import tmt_client, models as tmt_models
    HAS_SDK = True
except ImportError:
    HAS_SDK = False

# 腾讯云默认 region
DEFAULT_REGION = 'ap-guangzhou'

# OCR 接口 base64 图片大小上限（约 7MB，腾讯云限制）
MAX_BASE64_SIZE = 7 * 1024 * 1024


def _secret():
    sid = os.environ.get('TENCENT_SECRET_ID', '')
    skey = os.environ.get('TENCENT_SECRET_KEY', '')
    return sid, skey


def _ready():
    if not HAS_SDK:
        return False, '未安装 tencentcloud-sdk-python，请先在 requirements.txt 中添加该依赖并重新部署'
    sid, skey = _secret()
    if not sid or not skey:
        return False, '未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 环境变量'
    return True, ''


@ocr_bp.route('/recognize', methods=['POST'])
def recognize():
    """通用文字识别（GeneralBasicOCR）"""
    try:
        ready, msg = _ready()
        if not ready:
            return common.fail(msg, 503, 503)

        data = request.get_json(silent=True) or {}
        image_base64 = data.get('image_base64') or ''

        if not image_base64:
            return common.fail('缺少图片数据，请重新拍照或选择图片')

        # 去除 data URL 前缀（如 data:image/jpeg;base64,）
        image_base64 = re.sub(r'^data:image/\w+;base64,', '', image_base64.strip())

        if len(image_base64) > MAX_BASE64_SIZE:
            return common.fail('图片过大，请使用压缩后的图片（建议控制在 7MB 以内）')

        sid, skey = _secret()
        cred = credential.Credential(sid, skey)

        # 指定 region，不可为空
        client = ocr_client.OcrClient(cred, DEFAULT_REGION)
        req = ocr_models.GeneralBasicOCRRequest()
        req.ImageBase64 = image_base64
        resp = client.GeneralBasicOCR(req)

        texts = [d.DetectedText for d in (resp.TextDetections or [])]
        full = '\n'.join(texts)

        if not texts:
            return common.ok({'full_text': '', 'lines': []}, '未识别到文字，请确认图片中包含清晰文字')

        return common.ok({'full_text': full, 'lines': texts})

    except TencentCloudSDKException as e:
        if 'ServiceNotOpened' in str(e.message) or '服务未开通' in str(e.message):
            return common.fail('OCR 服务未开通，请前往腾讯云控制台 → 文字识别 → 开通服务', 503, 503)
        return common.fail(f'OCR 识别失败：{e.message}', 500, 500)
    except Exception as e:
        return common.fail(f'OCR 识别失败：{e}', 500, 500)


@functools.lru_cache(maxsize=512)
def _translate_cached(text, source, target):
    sid, skey = _secret()
    cred = credential.Credential(sid, skey)
    client = tmt_client.TmtClient(cred, DEFAULT_REGION)
    req = tmt_models.TextTranslateRequest()
    req.SourceText = text
    req.Source = source
    req.Target = target
    req.ProjectId = 0
    resp = client.TextTranslate(req)
    return resp.TargetText


@tmt_bp.route('/translate', methods=['POST'])
def translate():
    """文本翻译（TextTranslate）"""
    try:
        ready, msg = _ready()
        if not ready:
            return common.fail(msg, 503, 503)

        data = request.get_json(silent=True) or {}
        text = (data.get('text') or '').strip()
        if not text:
            return common.fail('翻译文本不能为空')

        source = data.get('source', 'auto')
        target = data.get('target', 'en')

        if len(text) > 5000:
            return common.fail('单次翻译文本不能超过 5000 字符')

        result = _translate_cached(text, source, target)
        return common.ok({'result': result, 'source': source, 'target': target})

    except TencentCloudSDKException as e:
        if 'ServiceNotOpened' in str(e.message) or '服务未开通' in str(e.message):
            return common.fail('机器翻译服务未开通，请前往腾讯云控制台 → 机器翻译 → 开通服务', 503, 503)
        return common.fail(f'翻译失败：{e.message}', 500, 500)
    except Exception as e:
        return common.fail(f'翻译失败：{e}', 500, 500)