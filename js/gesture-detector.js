/**
 * 手势检测器
 * 封装 MediaPipe Hands，识别以下手势：
 * - 手掌张开 (open)
 * - 握拳 (fist)
 * - 数字 1 (one)
 * - 数字 2 (two)
 * - 数字 3 (three)
 * 提供稳定的手势状态（带防抖）
 */

class GestureDetector {
  constructor(videoElement, overlayCanvas) {
    this.video = videoElement;
    this.overlayCanvas = overlayCanvas;
    this.overlayCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;

    this.hands = null;
    this.camera = null;
    this.isReady = false;
    this.isRunning = false;

    // 当前手势状态
    this.currentGesture = 'none';
    this.confidence = 0;
    this.stableGesture = 'none';
    this._gestureHistory = [];
    this._historySize = 8;

    // 手指伸展状态缓存
    this.fingersState = { thumb: false, index: false, middle: false, ring: false, pinky: false };

    // 回调
    this.onGestureChange = null;
    this.onReady = null;
    this.onError = null;

    // 手掌张开程度 (0~1) - 用于控制散开强度
    this.openAmount = 0;
  }

  /**
   * 初始化 MediaPipe Hands
   */
  async init() {
    try {
      // 检查 MediaPipe 是否加载
      if (typeof Hands === 'undefined') {
        throw new Error('MediaPipe Hands 未加载');
      }

      this.hands = new Hands({
        locateFile: (file) => {
          return `js/mediapipe/${file}`;
        }
      });

      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0, // 使用 lite 模型，性能更好
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5
      });

      this.hands.onResults((results) => this._onResults(results));

      this.isReady = true;
      if (this.onReady) this.onReady();

      return true;
    } catch (err) {
      console.error('手势检测器初始化失败:', err);
      if (this.onError) this.onError(err);
      return false;
    }
  }

  /**
   * 启动摄像头
   */
  async startCamera() {
    if (!this.isReady && !(await this.init())) {
      return false;
    }

    try {
      // 请求摄像头权限并启动
      this.camera = new Camera(this.video, {
        onFrame: async () => {
          if (this.hands && this.isRunning) {
            await this.hands.send({ image: this.video });
          }
        },
        width: 640,
        height: 480
      });

      await this.camera.start();
      this.isRunning = true;

      // 调整 overlay canvas 尺寸
      if (this.overlayCanvas) {
        this.overlayCanvas.width = this.video.videoWidth || 640;
        this.overlayCanvas.height = this.video.videoHeight || 480;
      }

      return true;
    } catch (err) {
      console.error('摄像头启动失败:', err);
      if (this.onError) this.onError(err);
      return false;
    }
  }

  /**
   * 停止
   */
  stop() {
    this.isRunning = false;
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }
  }

  /**
   * 处理 MediaPipe 结果
   */
  _onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this._updateGesture('none', 0);
      this._clearOverlay();
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    this._detectFingers(landmarks);
    const gesture = this._recognizeGesture();

    this._updateGesture(gesture.name, gesture.confidence);
    this._drawOverlay(landmarks);
  }

  /**
   * 检测每根手指是否伸直
   * 使用指尖与指节的相对位置判断
   */
  _detectFingers(landmarks) {
    // 手部关键点索引：
    // 0: 手腕 (wrist)
    // 1-4: 拇指 (thumb)
    // 5-8: 食指 (index)
    // 9-12: 中指 (middle)
    // 13-16: 无名指 (ring)
    // 17-20: 小指 (pinky)

    const getDist = (a, b) => {
      const dx = landmarks[a].x - landmarks[b].x;
      const dy = landmarks[a].y - landmarks[b].y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    // 手掌大小参考（手腕到中指根部的距离）
    const palmSize = getDist(0, 9);

    // 拇指：比较指尖(4)到手腕(0)的距离 vs 拇指根部(2)到手腕的距离
    // 更准确的方式：拇指指尖(4)到小指根部(17)的距离
    const thumbTipToPinky = getDist(4, 17);
    this.fingersState.thumb = thumbTipToPinky > palmSize * 0.7;

    // 其他四指：指尖 y 坐标小于（在图像中更靠上）指节 y 坐标即为伸直
    // 注意：y 越小越靠上
    this.fingersState.index = landmarks[8].y < landmarks[6].y - 0.02;
    this.fingersState.middle = landmarks[12].y < landmarks[10].y - 0.02;
    this.fingersState.ring = landmarks[16].y < landmarks[14].y - 0.02;
    this.fingersState.pinky = landmarks[20].y < landmarks[18].y - 0.02;

    // 计算手掌张开程度（0~1）
    const extendedCount = [
      this.fingersState.thumb,
      this.fingersState.index,
      this.fingersState.middle,
      this.fingersState.ring,
      this.fingersState.pinky
    ].filter(Boolean).length;

    // 更精细的张开程度：用指尖展开的平均距离
    const tipIndices = [4, 8, 12, 16, 20];
    let totalSpread = 0;
    for (let i = 0; i < tipIndices.length; i++) {
      for (let j = i + 1; j < tipIndices.length; j++) {
        totalSpread += getDist(tipIndices[i], tipIndices[j]);
      }
    }
    const avgSpread = totalSpread / 10;
    this.openAmount = Math.max(0, Math.min(1, (avgSpread / palmSize - 1.2) / 1.5));
  }

  /**
   * 根据手指状态识别手势
   */
  _recognizeGesture() {
    const f = this.fingersState;
    const extended = [f.thumb, f.index, f.middle, f.ring, f.pinky];
    const count = extended.filter(Boolean).length;

    // 握拳：所有手指都弯曲
    if (count === 0) {
      return { name: 'fist', confidence: 0.9 };
    }

    // 手掌张开：所有手指都伸直
    if (count === 5) {
      return { name: 'open', confidence: 0.9 };
    }

    // 数字 1：只有食指伸直
    if (f.index && !f.middle && !f.ring && !f.pinky) {
      return { name: 'one', confidence: 0.85 };
    }

    // 数字 2：食指和中指伸直（剪刀手也包含）
    if (f.index && f.middle && !f.ring && !f.pinky) {
      return { name: 'two', confidence: 0.85 };
    }

    // 数字 3：食指、中指、无名指伸直
    if (f.index && f.middle && f.ring && !f.pinky) {
      return { name: 'three', confidence: 0.8 };
    }

    // 数字 4：除拇指外都伸直
    if (!f.thumb && f.index && f.middle && f.ring && f.pinky) {
      return { name: 'four', confidence: 0.8 };
    }

    // 拇指点赞
    if (f.thumb && !f.index && !f.middle && !f.ring && !f.pinky) {
      return { name: 'thumbsup', confidence: 0.7 };
    }

    return { name: 'unknown', confidence: 0.5 };
  }

  /**
   * 更新手势状态（带防抖/平滑）
   */
  _updateGesture(gesture, confidence) {
    this.currentGesture = gesture;
    this.confidence = confidence;

    // 添加到历史
    this._gestureHistory.push(gesture);
    if (this._gestureHistory.length > this._historySize) {
      this._gestureHistory.shift();
    }

    // 找出出现次数最多的手势
    const counts = {};
    for (const g of this._gestureHistory) {
      counts[g] = (counts[g] || 0) + 1;
    }

    let maxGesture = 'none';
    let maxCount = 0;
    for (const g in counts) {
      if (counts[g] > maxCount) {
        maxCount = counts[g];
        maxGesture = g;
      }
    }

    // 超过 60% 一致才认为稳定
    const stableThreshold = Math.floor(this._historySize * 0.6);
    const newStable = maxCount >= stableThreshold ? maxGesture : 'none';

    const oldStable = this.stableGesture;
    if (newStable !== oldStable) {
      this.stableGesture = newStable;
      if (this.onGestureChange) {
        this.onGestureChange(newStable, oldStable);
      }
    }
  }

  /**
   * 绘制手部骨架覆盖层
   */
  _drawOverlay(landmarks) {
    if (!this.overlayCtx || !this.overlayCanvas) return;

    const ctx = this.overlayCtx;
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // 连接线
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // 拇指
      [0, 5], [5, 6], [6, 7], [7, 8], // 食指
      [5, 9], [9, 10], [10, 11], [11, 12], // 中指
      [9, 13], [13, 14], [14, 15], [15, 16], // 无名指
      [13, 17], [17, 18], [18, 19], [19, 20], // 小指
      [0, 17] // 掌缘
    ];

    ctx.strokeStyle = 'rgba(120, 200, 120, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of connections) {
      ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
      ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
    }
    ctx.stroke();

    // 关键点
    ctx.fillStyle = 'rgba(200, 255, 200, 0.9)';
    for (let i = 0; i < landmarks.length; i++) {
      ctx.beginPath();
      ctx.arc(landmarks[i].x * w, landmarks[i].y * h, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _clearOverlay() {
    if (!this.overlayCtx || !this.overlayCanvas) return;
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
  }

  /**
   * 获取当前张开程度 (0~1)
   */
  getOpenAmount() {
    if (this.stableGesture === 'open') return this.openAmount;
    if (this.stableGesture === 'fist') return 0;
    if (this.stableGesture === 'one' || this.stableGesture === 'two' || this.stableGesture === 'three') {
      return 0.3; // 数字手势时轻微散开
    }
    return this.openAmount * 0.5;
  }
}
