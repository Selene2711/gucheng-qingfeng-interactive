/**
 * 形状绘制工具
 * 为不同海报主题提供对应的碎片形状
 * 使用 Canvas 2D 路径绘制
 */

const ShapeDrawers = (() => {

  /**
   * 梅花花瓣形状
   * 五瓣梅花的单个花瓣 - 倒卵形，顶端圆钝，基部渐狭
   */
  function drawPlumPetal(ctx, size, rotation = 0) {
    ctx.save();
    ctx.rotate(rotation);
    const s = size / 2;
    ctx.beginPath();
    // 花瓣轮廓 - 倒卵形
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(
      s * 0.6, -s * 0.8,
      s * 0.7, s * 0.2,
      s * 0.15, s
    );
    ctx.bezierCurveTo(
      -s * 0.15, s,
      -s * 0.7, s * 0.2,
      -s * 0.6, -s * 0.8
    );
    ctx.closePath();
    ctx.restore();
  }

  /**
   * 枫叶形状
   * 掌状五裂，边缘有锯齿
   */
  function drawMapleLeaf(ctx, size, rotation = 0) {
    ctx.save();
    ctx.rotate(rotation);
    const s = size / 2;

    ctx.beginPath();
    // 枫叶 - 简化为掌状五裂
    // 顶端中裂
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.15, -s * 0.5);
    // 右上裂
    ctx.lineTo(s * 0.7, -s * 0.6);
    ctx.lineTo(s * 0.4, -s * 0.1);
    // 右侧裂
    ctx.lineTo(s * 0.85, s * 0.1);
    ctx.lineTo(s * 0.35, s * 0.3);
    // 右下裂
    ctx.lineTo(s * 0.5, s * 0.85);
    ctx.lineTo(0, s * 0.45);
    // 左下裂
    ctx.lineTo(-s * 0.5, s * 0.85);
    ctx.lineTo(-s * 0.35, s * 0.3);
    // 左侧裂
    ctx.lineTo(-s * 0.85, s * 0.1);
    ctx.lineTo(-s * 0.4, -s * 0.1);
    // 左上裂
    ctx.lineTo(-s * 0.7, -s * 0.6);
    ctx.lineTo(-s * 0.15, -s * 0.5);
    ctx.closePath();

    ctx.restore();
  }

  /**
   * 银杏叶形状
   * 扇形，顶端二裂，边缘波浪状
   */
  function drawGinkgoLeaf(ctx, size, rotation = 0) {
    ctx.save();
    ctx.rotate(rotation);
    const s = size / 2;

    ctx.beginPath();
    // 叶柄
    ctx.moveTo(s * 0.08, s);
    ctx.lineTo(-s * 0.08, s);
    ctx.lineTo(-s * 0.04, s * 0.3);
    ctx.lineTo(s * 0.04, s * 0.3);
    ctx.closePath();

    // 扇形叶片
    ctx.beginPath();
    ctx.moveTo(s * 0.04, s * 0.3);
    // 右半扇
    ctx.quadraticCurveTo(s * 0.3, s * 0.2, s * 0.7, -s * 0.1);
    ctx.quadraticCurveTo(s * 0.9, -s * 0.4, s * 0.6, -s * 0.7);
    // 顶端波浪
    ctx.quadraticCurveTo(s * 0.4, -s * 0.85, s * 0.2, -s * 0.7);
    ctx.quadraticCurveTo(0, -s * 0.9, -s * 0.2, -s * 0.7);
    ctx.quadraticCurveTo(-s * 0.4, -s * 0.85, -s * 0.6, -s * 0.7);
    // 左半扇
    ctx.quadraticCurveTo(-s * 0.9, -s * 0.4, -s * 0.7, -s * 0.1);
    ctx.quadraticCurveTo(-s * 0.3, s * 0.2, -s * 0.04, s * 0.3);
    ctx.closePath();

    ctx.restore();
  }

  /**
   * 获取对应主题的形状绘制函数
   */
  function getShapeDrawer(posterIndex) {
    switch (posterIndex) {
      case 0: return drawPlumPetal;   // 梅花
      case 1: return drawMapleLeaf;   // 枫叶
      case 2: return drawGinkgoLeaf;  // 银杏
      default: return drawPlumPetal;
    }
  }

  /**
   * 获取形状名称
   */
  function getShapeName(posterIndex) {
    return ['梅花瓣', '枫叶', '银杏叶'][posterIndex] || '碎片';
  }

  return {
    drawPlumPetal,
    drawMapleLeaf,
    drawGinkgoLeaf,
    getShapeDrawer,
    getShapeName
  };
})();
