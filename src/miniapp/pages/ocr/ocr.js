// pages/ocr/ocr.js —— OCR 识别与翻译（调用后端 /ocr/recognize 与 /tmt/translate）
const api = require('../../utils/api.js');

// 本地常用词典（离线优先，未命中再调用后端翻译）
const ZH2EN = {
  '你好': 'Hello', '谢谢': 'Thank you', '再见': 'Goodbye', '早上好': 'Good morning',
  '晚上好': 'Good evening', '我爱你': 'I love you', '对不起': 'Sorry', '没关系': "It doesn't matter",
  '欢迎': 'Welcome', '请': 'Please', '今天': 'today', '明天': 'tomorrow', '昨天': 'yesterday',
  '现在': 'now', '时间': 'time', '世界': 'world', '朋友': 'friend', '家人': 'family',
  '工作': 'work', '学习': 'study', '生活': 'life', '快乐': 'happy', '幸福': 'happiness',
  '美丽': 'beautiful', '聪明': 'smart', '努力': 'hardworking', '成功': 'success', '希望': 'hope',
  '梦想': 'dream', '未来': 'future', '中国': 'China', '你好吗': 'How are you?',
  '谢谢你的帮助': 'Thank you for your help', '很高兴认识你': 'Nice to meet you'
};

// 简中 → 繁中 常用词对照
const ZH2HANT = {
  '你好': '你好', '谢谢': '謝謝', '再见': '再見', '我爱你': '我愛你', '对不起': '對不起',
  '没关系': '沒關係', '欢迎': '歡迎', '今天': '今天', '明天': '明天', '昨天': '昨天',
  '现在': '現在', '时间': '時間', '世界': '世界', '朋友': '朋友', '家人': '家人',
  '工作': '工作', '学习': '學習', '生活': '生活', '快乐': '快樂', '幸福': '幸福',
  '美丽': '美麗', '聪明': '聰明', '努力': '努力', '成功': '成功', '希望': '希望',
  '梦想': '夢想', '未来': '未來', '中国': '中國', '你好吗': '你好嗎',
  '谢谢你的帮助': '謝謝你的幫助', '很高兴认识你': '很高興認識你'
};

const EN2ZH = {
  'hello': '你好', 'hi': '嗨', 'thank you': '谢谢', 'thanks': '谢谢', 'goodbye': '再见',
  'bye': '再见', 'good morning': '早上好', 'good evening': '晚上好', 'i love you': '我爱你',
  'sorry': '对不起', 'welcome': '欢迎', 'please': '请', 'today': '今天', 'tomorrow': '明天',
  'yesterday': '昨天', 'now': '现在', 'time': '时间', 'world': '世界', 'friend': '朋友',
  'family': '家人', 'work': '工作', 'study': '学习', 'life': '生活', 'happy': '快乐',
  'beautiful': '美丽', 'smart': '聪明', 'success': '成功', 'hope': '希望', 'dream': '梦想',
  'future': '未来', 'china': '中国', 'how are you': '你好吗', 'nice to meet you': '很高兴认识你'
};

Page({
  data: {
    tab: 'ocr',
    // OCR
    imagePath: '',
    ocrText: '',
    recognizing: false,
    // 翻译
    inputText: '',
    sourceLang: 'auto',
    sourceLangIndex: 0,
    targetLang: 'en',
    targetLangIndex: 0,
    langs: [
      { key: 'en', name: '英文' },
      { key: 'ja', name: '日文' },
      { key: 'ko', name: '韩文' },
      { key: 'zh-TW', name: '繁体中文' },
      { key: 'fr', name: '法文' },
      { key: 'de', name: '德文' },
      { key: 'es', name: '西班牙文' },
      { key: 'ru', name: '俄文' },
      { key: 'th', name: '泰文' },
      { key: 'vi', name: '越南文' },
      { key: 'pt', name: '葡萄牙文' },
      { key: 'it', name: '意大利文' }
    ],
    translateResult: '',
    translating: false
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  // ========== OCR ==========
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file) {
          this.setData({ imagePath: file.tempFilePath, ocrText: '' });
        }
      }
    });
  },

  recognize() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先拍照或选择图片', icon: 'none' });
      return;
    }
    this.setData({ recognizing: true, ocrText: '' });

    // 第一步：压缩图片到合理大小，再转 base64
    this._compressAndRead(this.data.imagePath)
      .then(base64 => {
        return api.post('/ocr/recognize', { image_base64: base64 });
      })
      .then(data => {
        this.setData({ recognizing: false, ocrText: data.full_text || '' });
        if (!data.full_text) {
          wx.showToast({ title: '未识别到文字', icon: 'none' });
        }
      })
      .catch(err => {
        this.setData({ recognizing: false });
        const msg = (err && err.message) || 'OCR 识别失败';
        wx.showToast({ title: msg, icon: 'none', duration: 2500 });
      });
  },

  // 压缩图片后读取 base64（限制在 1MB 以下，保证请求不超限）
  _compressAndRead(filePath) {
    return new Promise((resolve, reject) => {
      // 先获取图片信息
      wx.getImageInfo({
        src: filePath,
        success: (info) => {
          const maxSide = 1200; // 最大边长，超过则等比缩放
          let w = info.width;
          let h = info.height;
          let quality = 80;

          if (w > maxSide || h > maxSide) {
            const ratio = Math.min(maxSide / w, maxSide / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
            quality = 70; // 缩放后进一步降低质量
          }

          // 用 canvas 压缩
          wx.createSelectorQuery()
            .select('#compressCanvas')
            .fields({ node: true, size: false })
            .exec((sel) => {
              if (!sel || !sel[0] || !sel[0].node) {
                // 无 canvas 节点时直接读原图
                this._readBase64(filePath, resolve, reject);
                return;
              }
              const canvas = sel[0].node;
              const ctx = canvas.getContext('2d');
              canvas.width = w;
              canvas.height = h;

              const img = canvas.createImage();
              img.onload = () => {
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                wx.canvasToTempFilePath({
                  canvas,
                  quality: quality / 100,
                  fileType: 'image/jpeg',
                  success: (tmp) => {
                    this._readBase64(tmp.tempFilePath, resolve, reject);
                  },
                  fail: () => {
                    this._readBase64(filePath, resolve, reject);
                  }
                });
              };
              img.onerror = () => {
                this._readBase64(filePath, resolve, reject);
              };
              img.src = filePath;
            });
        },
        fail: () => {
          this._readBase64(filePath, resolve, reject);
        }
      });
    });
  },

  _readBase64(filePath, resolve, reject) {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res) => resolve(res.data),
      fail: () => reject(new Error('读取图片失败'))
    });
  },

  onOcrInput(e) {
    this.setData({ ocrText: e.detail.value });
  },

  copyOcr() {
    if (!this.data.ocrText) return;
    wx.setClipboardData({
      data: this.data.ocrText,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  useOcrToTranslate() {
    this.setData({ tab: 'translate', inputText: this.data.ocrText, translateResult: '' });
  },

  // ========== 翻译 ==========
  onInputText(e) {
    this.setData({ inputText: e.detail.value, translateResult: '' });
  },

  onLangChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      targetLangIndex: idx,
      targetLang: this.data.langs[idx].key,
      translateResult: ''
    });
  },

  // 快速切换语言方向
  swapLang() {
    this.setData({
      translateResult: '',
      inputText: this.data.translateResult || this.data.inputText
    });
  },

  copyTranslate() {
    if (!this.data.translateResult) return;
    wx.setClipboardData({
      data: this.data.translateResult,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  translate() {
    const text = (this.data.inputText || '').trim();
    if (!text) {
      wx.showToast({ title: '请输入要翻译的文字', icon: 'none' });
      return;
    }

    // 本地词典优先
    const local = this._localTranslate(text, this.data.targetLang);
    if (local) {
      this.setData({ translateResult: local });
      return;
    }

    // 未命中则调用后端翻译
    this.setData({ translating: true, translateResult: '' });
    api.post('/tmt/translate', {
      text,
      source: 'auto',
      target: this.data.targetLang
    })
      .then(data => {
        this.setData({ translating: false, translateResult: data.result || '' });
      })
      .catch(err => {
        this.setData({ translating: false, translateResult: '' });
        const msg = (err && err.message) || '翻译失败';
        wx.showToast({ title: msg, icon: 'none', duration: 2500 });
      });
  },

  _localTranslate(text, target) {
    // 简中 → 繁中
    if (target === 'zh-TW') {
      if (ZH2HANT[text]) return ZH2HANT[text];
    }
    // 中 → 英
    if (target === 'en') {
      if (ZH2EN[text]) return ZH2EN[text];
      const lower = text.toLowerCase();
      if (EN2ZH[lower]) return EN2ZH[lower];
    }
    // 本地日韩词典
    if (target === 'ja') {
      const JA = { '你好': 'こんにちは', '谢谢': 'ありがとう', '再见': 'さようなら', '我爱你': '愛してる',
        '对不起': 'ごめんなさい', '早上好': 'おはようございます', '晚上好': 'こんばんは' };
      if (JA[text]) return JA[text];
    }
    if (target === 'ko') {
      const KO = { '你好': '안녕하세요', '谢谢': '감사합니다', '再见': '안녕히 가세요', '我爱你': '사랑해요',
        '对不起': '죄송합니다', '早上好': '좋은 아침', '晚上好': '안녕하세요' };
      if (KO[text]) return KO[text];
    }
    return '';
  }
});