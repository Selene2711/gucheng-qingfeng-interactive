/**
 * 粒子系统
 * 将海报图像分解为具有主题形状的粒子
 * 支持散开、聚合、漂浮三种状态
 */

class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.posterImage = null;
    this.posterIndex = 0;
    this._posterLoadVersion = 0;
    this.dpr = window.devicePixelRatio || 1;

    // 状态：0=完整海报, 1=散开中, 2=飘散中, 3=聚合中
    this.state = 0;
    this.scatterProgress = 0; // 0~1
    this.gatherProgress = 1;  // 0~1

    // 飘散参数
    this.windStrength = 0.15;
    this.time = 0;

    // 粒子大小
    this.particleBaseSize = 18;
    this.particleDensity = 0.04; // 粒子采样密度

    // 鼠标/触摸交互
    this.mousePos = { x: 0, y: 0 };
    this.isDragging = false;
    this.dragScatterAmount = 0;

    this.resize();
    this._bindEvents();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;

    // 高清图像渲染设置
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  _bindEvents() {
    // 鼠标拖拽散开
    this.canvas.addEventListener('mousedown', (e) => {
      if (window.appMode === 'mouse') {
        this.wasDragging = false;
        this.isDragging = true;
        this._updateMousePos(e);
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this._updateMousePos(e);
      if (this.isDragging && window.appMode === 'mouse') {
        this.wasDragging = true;
        this.dragScatterAmount = Math.min(1, this.dragScatterAmount + 0.08);
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      if (window.appMode === 'mouse') {
        this.isDragging = false;
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (window.appMode === 'mouse') {
        this.isDragging = false;
      }
    });

    // 点击聚合
    this.canvas.addEventListener('click', (e) => {
      if (window.appMode === 'mouse' && !this.wasDragging) {
        this.gather();
      }
      this.wasDragging = false;
    });

    // 触摸支持
    this.canvas.addEventListener('touchstart', (e) => {
      if (window.appMode === 'mouse' && e.touches.length > 0) {
        this.wasDragging = false;
        this.isDragging = true;
        this._updateMousePos(e.touches[0]);
      }
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this._updateMousePos(e.touches[0]);
        if (this.isDragging && window.appMode === 'mouse') {
          this.wasDragging = true;
          this.dragScatterAmount = Math.min(1, this.dragScatterAmount + 0.06);
        }
      }
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      if (window.appMode === 'mouse') {
        this.isDragging = false;
      }
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('resize', () => {
      this.resize();
      if (this.posterImage) {
        this._createParticles();
      }
    });
  }

  _updateMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mousePos.x = e.clientX - rect.left;
    this.mousePos.y = e.clientY - rect.top;
  }

  /**
   * 加载海报并创建粒子
   */
  loadPoster(imageSrc, posterIndex) {
    const requestVersion = ++this._posterLoadVersion;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (requestVersion !== this._posterLoadVersion) {
          resolve(false);
          return;
        }
        this.posterImage = img;
        this.posterIndex = posterIndex;
        this._createParticles();
        this.state = 0;
        this.gatherProgress = 1;
        this.scatterProgress = 0;
        resolve(true);
      };
      img.onerror = reject;
      img.src = imageSrc;
    });
  }

  _createParticles() {
    this.particles = [];

    if (!this.posterImage) return;

    // 计算海报在画布中的显示区域（contain 模式）
    const imgRatio = this.posterImage.width / this.posterImage.height;
    const canvasRatio = this.width / this.height;

    let drawW, drawH, drawX, drawY;

    if (imgRatio > canvasRatio) {
      drawW = this.width;
      drawH = this.width / imgRatio;
      drawX = 0;
      drawY = (this.height - drawH) / 2;
    } else {
      drawH = this.height;
      drawW = this.height * imgRatio;
      drawY = 0;
      drawX = (this.width - drawW) / 2;
    }

    this.drawX = drawX;
    this.drawY = drawY;
    this.drawW = drawW;
    this.drawH = drawH;

    // 使用离屏 canvas 采样颜色
    // 根据显示宽度计算采样分辨率，保证每 6~8 个 CSS 像素一个粒子
    const sampleCols = Math.max(60, Math.min(160, Math.round(drawW / 4)));
    const offCanvas = document.createElement('canvas');
    offCanvas.width = sampleCols;
    offCanvas.height = Math.round(sampleCols / imgRatio);
    const offCtx = offCanvas.getContext('2d');
    // 高质量缩放采样
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';
    offCtx.drawImage(this.posterImage, 0, 0, offCanvas.width, offCanvas.height);

    const imageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
    const data = imageData.data;

    const shapeDrawer = ShapeDrawers.getShapeDrawer(this.posterIndex);

    // 生成粒子 - 均匀采样
    const cols = offCanvas.width;
    const rows = offCanvas.height;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = (y * cols + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        // 跳过过于透明的像素
        if (a < 30) continue;

        // 计算原始位置
        const px = drawX + (x / cols) * drawW;
        const py = drawY + (y / rows) * drawH;

        // 计算散开目标位置（随机分布在周围）
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 180;
        const targetX = this.width / 2 + Math.cos(angle) * dist * (0.5 + Math.random() * 0.5);
        const targetY = this.height / 2 + Math.sin(angle) * dist * (0.5 + Math.random() * 0.5);

        // 粒子大小：根据采样间距自适应，保证聚合时粒子能完整覆盖海报
        const spacing = drawW / sampleCols;
        const size = spacing * 2.2 * (0.7 + Math.random() * 0.6);

        // 颜色亮度微调，增加层次感
        const brightness = 0.9 + Math.random() * 0.2;
        const color = `rgb(${Math.min(255, Math.round(r * brightness))}, ${Math.min(255, Math.round(g * brightness))}, ${Math.min(255, Math.round(b * brightness))})`;

        this.particles.push({
          // 原始位置（聚合位置）
          ox: px,
          oy: py,
          // 当前位置
          x: px,
          y: py,
          // 散开目标
          tx: targetX,
          ty: targetY,
          // 飘散参数
          floatOffsetX: Math.random() * Math.PI * 2,
          floatOffsetY: Math.random() * Math.PI * 2 + Math.PI / 2,
          floatSpeed: 0.3 + Math.random() * 0.5,
          floatAmpX: 8 + Math.random() * 12,
          floatAmpY: 5 + Math.random() * 8,
          // 旋转
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.02,
          // 大小
          size: size,
          // 颜色
          color: color,
          // 延迟（制造错落感）
          delay: Math.random() * 0.5,
          // 形状
          shapeDrawer: shapeDrawer,
          // 物理速度
          vx: 0,
          vy: 0
        });
      }
    }

    console.log(`创建了 ${this.particles.length} 个粒子`);
  }

  /**
   * 散开
   */
  scatter() {
    if (this.state === 1 || this.state === 2) return;
    this.state = 1; // 散开中
    this.scatterProgress = 0;
  }

  /**
   * 聚合
   */
  gather() {
    if (this.state === 3 || this.state === 0) return;
    this.state = 3; // 聚合中
    this.gatherProgress = 0;
  }

  /**
   * 设置散开程度（0~1，用于手势强度控制）
   */
  setScatterAmount(amount) {
    amount = Math.max(0, Math.min(1, amount));
    if (amount > 0.1 && this.state === 0) {
      this.state = 1;
    }
    this.scatterProgress = amount;
    if (amount >= 0.95) {
      this.state = 2; // 完全散开，进入飘散状态
    } else if (amount < 0.05 && (this.state === 1 || this.state === 2)) {
      this.state = 3;
      this.gatherProgress = 0;
    }
  }

  /**
   * 更新一帧
   */
  update(dt) {
    this.time += dt;

    // 鼠标模式下的拖拽散开
    if (window.appMode === 'mouse') {
      if (!this.isDragging && this.dragScatterAmount > 0) {
        this.dragScatterAmount = Math.max(0, this.dragScatterAmount - dt * 0.15);
      }
      this.setScatterAmount(this.dragScatterAmount);
    }

    // 状态转换
    if (this.state === 1) {
      // 散开中 — 放慢节奏，约 2.5 秒
      this.scatterProgress = Math.min(1, this.scatterProgress + dt * 0.4);
      if (this.scatterProgress >= 1) {
        this.state = 2; // 进入飘散状态
      }
    } else if (this.state === 3) {
      // 聚合中 — 放慢节奏，约 2.8 秒
      this.gatherProgress = Math.min(1, this.gatherProgress + dt * 0.35);
      if (this.gatherProgress >= 1) {
        this.state = 0; // 回到完整海报
      }
    }

    // 更新每个粒子
    for (const p of this.particles) {
      const delay = p.delay;
      let progress;

      if (this.state === 0) {
        // 完整海报 - 粒子在原位
        p.x = p.ox;
        p.y = p.oy;
        p.rotation *= 0.95;
        continue;
      }

      if (this.state === 1 || this.state === 2) {
        // 散开或飘散
        progress = this._easeOutCubic(Math.max(0, Math.min(1, (this.scatterProgress - delay) / (1 - delay))));
      } else if (this.state === 3) {
        // 聚合
        progress = 1 - this._easeInCubic(Math.max(0, Math.min(1, (this.gatherProgress - delay) / (1 - delay))));
      }

      // 基础位置（原位 ↔ 散开目标）
      let baseX = p.ox + (p.tx - p.ox) * progress;
      let baseY = p.oy + (p.ty - p.oy) * progress;

      // 飘散时的浮动效果（清风感）
      if (this.state === 2) {
        const floatAmount = 1;
        const windOffset = Math.sin(this.time * p.floatSpeed * 0.6 + p.floatOffsetX) * p.floatAmpX * floatAmount;
        const windOffsetY = Math.cos(this.time * p.floatSpeed * 0.4 + p.floatOffsetY) * p.floatAmpY * floatAmount;
        // 整体向右下方轻微漂移（清风方向）
        const driftX = Math.sin(this.time * 0.1) * 12;
        const driftY = Math.cos(this.time * 0.08) * 6;

        baseX += windOffset + driftX;
        baseY += windOffsetY + driftY;
      }

      // 平滑移动
      p.x += (baseX - p.x) * 0.08;
      p.y += (baseY - p.y) * 0.08;

      // 旋转
      if (this.state === 1 || this.state === 2) {
        p.rotation += p.rotationSpeed * (0.5 + progress * 0.5);
      } else if (this.state === 3) {
        p.rotation *= 0.96; // 逐渐回正
      }
    }
  }

  /**
   * 渲染
   */
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.posterImage) return;

    // 完整海报状态：直接绘制高清原图（最清晰）
    if (this.state === 0) {
      this._drawPosterImage();
      return;
    }

    // 聚合中：后期渐显完整海报
    if (this.state === 3) {
      if (this.gatherProgress > 0.7) {
        // 交叉淡入淡出：原图渐显，粒子渐隐
        const fade = (this.gatherProgress - 0.7) / 0.3;
        // 先画粒子（底层）
        ctx.globalAlpha = 1 - fade;
        this._renderParticles();
        ctx.globalAlpha = 1;
        // 再画高清海报（顶层，渐显）
        ctx.globalAlpha = fade;
        this._drawPosterImage();
        ctx.globalAlpha = 1;
      } else {
        this._renderParticles();
      }
    }
    // 散开中：初期渐隐完整海报
    else if (this.state === 1) {
      if (this.scatterProgress < 0.3) {
        // 交叉淡入淡出：原图渐隐，粒子渐显
        const fade = this.scatterProgress / 0.3;
        // 先画原图（底层）
        ctx.globalAlpha = 1 - fade;
        this._drawPosterImage();
        ctx.globalAlpha = 1;
        // 再画粒子（顶层，渐显）
        ctx.globalAlpha = fade;
        this._renderParticles();
        ctx.globalAlpha = 1;
      } else {
        this._renderParticles();
      }
    }
    // 飘散中：只绘粒子
    else {
      this._renderParticles();
    }
  }

  /**
   * 以高质量方式绘制完整海报图像
   */
  _drawPosterImage() {
    const ctx = this.ctx;
    // 确保高质量缩放
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.posterImage, this.drawX, this.drawY, this.drawW, this.drawH);
  }

  _renderParticles() {
    const ctx = this.ctx;

    // 按 y 排序制造层次
    const sorted = this.particles.slice().sort((a, b) => a.y - b.y);

    for (const p of sorted) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      // 绘制形状
      p.shapeDrawer(ctx, p.size);

      // 填充颜色
      ctx.fillStyle = p.color;
      ctx.fill();

      ctx.restore();
    }
  }

  _easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  _easeInCubic(t) {
    return t * t * t;
  }

  /**
   * 动画循环
   */
  start() {
    let lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      this.update(dt);
      this.render();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
