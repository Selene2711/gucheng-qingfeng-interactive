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

    // 海报数据
    this.posters = [
      { src: 'assets/poster1.jpg', name: '梅花', theme: '梅香正气' },
      { src: 'assets/poster2.jpg', name: '枫叶', theme: '丹枫高洁' },
      { src: 'assets/poster3.jpg', name: '银杏', theme: '金杏守心' }
    ];
    this.currentPosterIndex = 0;

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

    this.currentPosterIndex = index;

    // 更新指示器
    this.dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });

    // 先聚合，再切换
    this.particleSystem.gather();

    // 等待聚合动画差不多完成再切换
    clearTimeout(this._posterLoadTimer);
    this._posterLoadTimer = setTimeout(() => {
      this.particleSystem.loadPoster(this.posters[index].src, index).catch((err) => {
        console.error('海报加载失败:', err);
        this.tipText.textContent = '海报加载失败，请刷新页面重试';
      });
    }, 400);
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
    } else if (newGesture === 'fist') {
      this.particleSystem.gather();
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
   * 主循环中更新（用于实时张开程度控制）
   */
  update() {
    if (window.appMode === 'gesture' && this.gestureDetector && this.gestureDetector.isRunning) {
      const openAmount = this.gestureDetector.getOpenAmount();
      // 只在稳定手势是 open 时用连续值控制
      if (this.gestureDetector.stableGesture === 'open') {
        this.particleSystem.setScatterAmount(Math.max(
          this.particleSystem.scatterProgress,
          openAmount
        ));
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
