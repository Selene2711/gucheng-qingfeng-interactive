/**
 * 主应用逻辑
 * 串联粒子系统、手势识别、UI 交互
 */

// 全局模式
window.appMode = 'gesture'; // 'gesture' 或 'mouse'

class App {
  constructor() {
    // DOM 元素
    this.canvas = document.getElementById('posterCanvas');
    this.video = document.getElementById('inputVideo');
    this.overlayCanvas = document.getElementById('overlayCanvas');
    this.cameraPreview = document.getElementById('cameraPreview');
    this.cameraStatus = document.getElementById('cameraStatus');
    this.statusText = document.getElementById('statusText');
    this.statusDot = document.querySelector('.status-dot');
    this.gestureHint = document.getElementById('gestureHint');
    this.currentGestureEl = document.getElementById('currentGesture');
    this.gestureNameEl = document.getElementById('gestureName');
    this.tipText = document.getElementById('tipText');
    this.permissionModal = document.getElementById('permissionModal');
    this.dots = document.querySelectorAll('.poster-indicator .dot');
    this.modeGestureBtn = document.getElementById('modeGesture');
    this.modeMouseBtn = document.getElementById('modeMouse');
    this.btnAllowCamera = document.getElementById('btnAllowCamera');
    this.btnUseMouse = document.getElementById('btnUseMouse');

    // 故事层 DOM
    this.storyLayer = document.getElementById('storyLayer');
    this.storyPhoto = document.getElementById('storyPhoto');
    this.storyEyebrow = document.getElementById('storyEyebrow');
    this.storyTitle = document.getElementById('storyTitle');
    this.storyBody = document.getElementById('storyBody');
    this.storyDecoration = document.getElementById('storyDecoration');

    // 海报数据
    this.posters = [
      { src: 'assets/poster1.jpg', name: '梅花', theme: '梅香正气', storyTheme: 'theme-plum', eyebrow: '菰城廉脉 · 源头' },
      { src: 'assets/poster2.jpg', name: '枫叶', theme: '丹枫高洁', storyTheme: 'theme-maple', eyebrow: '菰城廉脉 · 守节' },
      { src: 'assets/poster3.jpg', name: '银杏', theme: '金杏守心', storyTheme: 'theme-ginkgo', eyebrow: '菰城廉脉 · 尚俭' }
    ];
    this.currentPosterIndex = 0;

    // 故事内容数据（顺序与 posters 对应：梅花、枫叶、银杏）
    this.stories = [
      {
        title: '春申君黄歇 · 筑菰城、兴水利而不私',
        body: '公元前248年，春申君黄歇在此营建菰城（下菰城遗址，就在菰城村内），作为封邑。他主持修水利、通河道、劝农垦田，造福当地百姓。虽受封于此，却不独占土地资源，以仁政安民，不搜刮民财，奠定菰城最早的清正根基，是菰城廉脉的源头。',
        photo: 'assets/story1.jpg'
      },
      {
        title: '姚察 · 拒礼守节',
        body: '南朝姚察，曾在吴兴（菰城属地）任职，品行高洁。有门生故吏送来厚礼，想托他办事，姚察一概谢绝，分文不取。他说：我身居乡土，当守本心，不因人情私利动摇操守。丹枫赤诚，守正不阿，是吴兴南部（道场山菰城片区）流传的清廉故事。',
        photo: 'assets/story2.jpg'
      },
      {
        title: '陆纳 · 杖侄拒奢',
        body: '陆纳是东晋吴兴太守，治所就在菰城一带。他一生清贫，反对奢靡。一次大将军谢安来访，陆纳只准备简单茶饭；他侄子自作主张摆出丰盛宴席，待客之后，陆纳怒而杖责侄子，训诫他不可铺张浮华、沾染奢靡之风。以俭养廉，清心自持，被道场乡清廉文化长廊收录。',
        photo: 'assets/story3.jpg'
      }
    ];

    // 故事层状态
    this.storyVisible = false;
    this.storyFading = false;
    this._storyContentIndex = -1;
    this._storyImageVersion = 0;
    this._posterLoadVersion = 0;
    this._storyShowTimer = null;
    this._storyHideTimer = null;
    this._posterLoadTimer = null;

    // 手势相关
    this.gestureDetector = null;
    this._lastNumberGesture = null;
    this._numberGestureTime = 0;
    this._posterSwitchCooldown = 0;

    // 初始化
    this._init();
  }

  async _init() {
    // 创建粒子系统
    this.particleSystem = new ParticleSystem(this.canvas);
    this.particleSystem.start();

    // 加载第一张海报
    await this._loadPoster(0);

    // 绑定 UI 事件
    this._bindUIEvents();

    // 默认以鼠标模式启动，展示清晰海报
    // 用户点击「手势模式」按钮后再请求摄像头权限
    this._switchMode('mouse');
  }

  async _loadPoster(index) {
    if (index < 0 || index >= this.posters.length) return;

    const requestVersion = ++this._posterLoadVersion;
    clearTimeout(this._posterLoadTimer);
    if (this._storyShowTimer) {
      clearTimeout(this._storyShowTimer);
      this._storyShowTimer = null;
    }

    this.currentPosterIndex = index;

    // 更新指示器
    this.dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });

    // Hide the story before changing the poster.
    this._hideStory();
    this.particleSystem.gather();

    this._posterLoadTimer = setTimeout(() => {
      this.particleSystem.loadPoster(this.posters[index].src, index)
        .then((loaded) => {
          if (loaded && requestVersion === this._posterLoadVersion) {
            this._updateStoryContent(index);
          }
        })
        .catch((err) => {
          if (requestVersion === this._posterLoadVersion) {
            console.error('海报加载失败:', err);
            this.tipText.textContent = '海报加载失败，请刷新页面重试';
          }
        });
    }, 600);
  }

  /**
   * 更新故事层内容（预加载图片）
   */
  _updateStoryContent(index) {
    const story = this.stories[index];
    const poster = this.posters[index];
    if (!story || !poster) return;
    if (this._storyContentIndex === index) return;
    this._storyContentIndex = index;

    // 设置装饰主题
    this.storyDecoration.className = 'story-decoration ' + (poster.storyTheme || '');

    // 预加载图片
    const imageVersion = ++this._storyImageVersion;
    const img = new Image();
    this.storyPhoto.parentElement.hidden = true;
    img.onload = () => {
      if (imageVersion !== this._storyImageVersion) return;
      this.storyPhoto.src = story.photo;
      this.storyPhoto.alt = story.title;
      this.storyPhoto.parentElement.hidden = false;
    };
    img.onerror = () => {
      if (imageVersion !== this._storyImageVersion) return;
      console.error('故事图片加载失败:', story.photo);
      this.storyPhoto.parentElement.hidden = true;
    };
    img.src = story.photo;

    // 设置文字
    this.storyEyebrow.textContent = poster.eyebrow || '';
    this.storyTitle.textContent = story.title;
    this.storyBody.textContent = story.body;
  }

  /**
   * 显示故事层
   */
  _showStory() {
    if (this.storyVisible) return;

    // 确保内容是当前海报的
    this._updateStoryContent(this.currentPosterIndex);

    // 清除隐藏定时器
    if (this._storyHideTimer) {
      clearTimeout(this._storyHideTimer);
      this._storyHideTimer = null;
    }

    this.storyLayer.classList.remove('fading');
    // 强制 reflow 以重新触发动画
    void this.storyLayer.offsetWidth;
    this.storyLayer.classList.add('visible');
    this.storyLayer.removeAttribute('aria-hidden');
    this.storyVisible = true;
    this.storyFading = false;
  }

  /**
   * 隐藏故事层
   * @param {Function} callback - 隐藏完成后的回调
   */
  _hideStory(callback) {
    if (!this.storyVisible && !this.storyFading) {
      if (callback) callback();
      return;
    }

    // 清除显示定时器
    if (this._storyShowTimer) {
      clearTimeout(this._storyShowTimer);
      this._storyShowTimer = null;
    }

    this.storyLayer.classList.remove('visible');
    this.storyLayer.classList.add('fading');
    this.storyLayer.setAttribute('aria-hidden', 'true');
    this.storyVisible = false;
    this.storyFading = true;

    // 0.5 秒后隐藏完成
    clearTimeout(this._storyHideTimer);
    this._storyHideTimer = setTimeout(() => {
      this.storyLayer.classList.remove('fading');
      this.storyFading = false;
      this._storyHideTimer = null;
      if (callback) callback();
    }, 550);
  }

  _bindUIEvents() {
    // 海报指示器点击
    this.dots.forEach((dot, i) => {
      dot.addEventListener('click', () => this._loadPoster(i));
    });

    // 模式切换按钮
    this.modeGestureBtn.addEventListener('click', () => {
      if (window.appMode !== 'gesture') {
        this._tryStartGestureMode(false);
      }
    });

    this.modeMouseBtn.addEventListener('click', () => {
      this._switchMode('mouse');
    });

    // 权限弹窗按钮
    this.btnAllowCamera.addEventListener('click', () => {
      this.permissionModal.style.display = 'none';
      this._tryStartGestureMode(true);
    });

    this.btnUseMouse.addEventListener('click', () => {
      this.permissionModal.style.display = 'none';
      this._switchMode('mouse');
    });
  }

  async _tryStartGestureMode(forceRequest = false) {
    // 检查浏览器是否支持 getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('浏览器不支持摄像头');
      this._switchMode('mouse');
      return;
    }

    // 如果不是强制请求，先检查权限状态
    if (!forceRequest) {
      try {
        const permission = await navigator.permissions.query({ name: 'camera' });
        if (permission.state === 'denied') {
          console.warn('摄像头权限已被拒绝');
          this._switchMode('mouse');
          return;
        }
        if (permission.state === 'prompt') {
          // 显示权限引导弹窗
          this.permissionModal.style.display = 'flex';
          return;
        }
        // granted - 继续
      } catch (e) {
        // permissions API 不可用，直接尝试
        console.warn('无法查询摄像头权限:', e);
      }
    }

    this._setStatus('正在启动摄像头…', false);

    // 创建手势检测器
    this.gestureDetector = new GestureDetector(this.video, this.overlayCanvas);

    this.gestureDetector.onReady = () => {
      console.log('手势检测器就绪');
    };

    this.gestureDetector.onGestureChange = (newGesture, oldGesture) => {
      this._onGestureChange(newGesture, oldGesture);
    };

    this.gestureDetector.onError = (err) => {
      console.error('手势检测错误:', err);
      this._setStatus('摄像头不可用', false);
      this._switchMode('mouse');
    };

    try {
      const success = await this.gestureDetector.startCamera();
      if (success) {
        this._setStatus('手势识别中', true);
        this._switchMode('gesture');
      } else {
        this._switchMode('mouse');
      }
    } catch (err) {
      console.error('启动摄像头失败:', err);
      this._switchMode('mouse');
    }
  }

  _switchMode(mode) {
    window.appMode = mode;

    if (mode === 'gesture') {
      this.modeGestureBtn.classList.add('active');
      this.modeMouseBtn.classList.remove('active');
      this.cameraPreview.classList.remove('hidden');
      this.tipText.textContent = '请将手置于镜头前，使用手势与海报互动';
    } else {
      this.modeGestureBtn.classList.remove('active');
      this.modeMouseBtn.classList.add('active');
      this.cameraPreview.classList.add('hidden');
      this.tipText.textContent = '在海报上拖拽散开粒子，点击画面重新聚合';

      // 停止摄像头
      if (this.gestureDetector) {
        this.gestureDetector.stop();
      }
    }
  }

  _setStatus(text, active) {
    this.statusText.textContent = text;
    if (active) {
      this.statusDot.classList.add('active');
    } else {
      this.statusDot.classList.remove('active');
    }
  }

  _onGestureChange(newGesture, oldGesture) {
    // 更新显示
    const gestureNames = {
      'none': '未检测到手',
      'open': '手掌张开',
      'fist': '握拳',
      'one': '数字 1',
      'two': '数字 2',
      'three': '数字 3',
      'four': '数字 4',
      'thumbsup': '点赞',
      'unknown': '未知手势'
    };

    if (newGesture !== 'none') {
      this.currentGestureEl.classList.add('visible');
      this.gestureNameEl.textContent = gestureNames[newGesture] || newGesture;
    } else {
      this.currentGestureEl.classList.remove('visible');
    }

    // 处理散开/聚合
    if (newGesture === 'open') {
      this.particleSystem.scatter();
      // 粒子散开后半段开始浮现故事（约 1.2 秒后）
      if (this._storyShowTimer) clearTimeout(this._storyShowTimer);
      this._storyShowTimer = setTimeout(() => {
        this._showStory();
      }, 1200);
    } else if (newGesture === 'fist') {
      // 先隐藏故事，再聚合粒子
      if (this._storyShowTimer) {
        clearTimeout(this._storyShowTimer);
        this._storyShowTimer = null;
      }
      this._hideStory(() => {
        this.particleSystem.gather();
      });
    }

    // 处理数字手势切换海报（带冷却）
    const now = Date.now();
    if (this._posterSwitchCooldown > now) return;

    if (newGesture === 'one' && oldGesture !== 'one') {
      this._loadPoster(0);
      this._posterSwitchCooldown = now + 1500;
    } else if (newGesture === 'two' && oldGesture !== 'two') {
      this._loadPoster(1);
      this._posterSwitchCooldown = now + 1500;
    } else if (newGesture === 'three' && oldGesture !== 'three') {
      this._loadPoster(2);
      this._posterSwitchCooldown = now + 1500;
    }
  }

  /**
   * 主循环中更新（用于实时张开程度控制、鼠标模式故事联动）
   */
  update() {
    if (window.appMode === 'gesture' && this.gestureDetector && this.gestureDetector.isRunning) {
      const openAmount = this.gestureDetector.getOpenAmount();
      if (this.gestureDetector.stableGesture === 'open') {
        this.particleSystem.setScatterAmount(Math.max(
          this.particleSystem.scatterProgress,
          openAmount
        ));
      }
    }

    // 鼠标模式下：根据散开程度控制故事显示
    if (window.appMode === 'mouse') {
      const progress = this.particleSystem.scatterProgress;
      const state = this.particleSystem.state;

      // 散开进度超过 60% 时显示故事
      if ((state === 1 || state === 2) && progress > 0.6 && !this.storyVisible && !this._storyShowTimer) {
        this._storyShowTimer = setTimeout(() => {
          this._showStory();
          this._storyShowTimer = null;
        }, 100);
      }
      // 聚合中或进度低于 30% 时隐藏故事
      if ((state === 3 || state === 0) && this.storyVisible && !this._storyHideTimer) {
        this._hideStory();
      }
    }

    requestAnimationFrame(() => this.update());
  }

  start() {
    this.update();
  }
}

// 启动应用
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.start();
  window.app = app;
});
