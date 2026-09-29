import Phaser from 'phaser';

// 과장된 반응(juice) 모음: 팝업 텍스트, 화면 흔들림, 파편.
export default class Fx {
  constructor(scene) {
    this.scene = scene;
  }

  popText(x, y, text, opts = {}) {
    const { color = '#ffffff', size = 22, rise = 40, duration = 800, depth = 60 } = opts;
    const t = this.scene.add.text(x, y, text, {
      fontFamily: 'sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(depth).setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t, y: y - rise, alpha: 0, delay: duration * 0.4, duration: duration * 0.6, ease: 'Quad.easeIn',
      onComplete: () => t.destroy(),
    });
    return t;
  }

  shake(durationMs, intensity) {
    this.scene.cameras.main.shake(durationMs, intensity);
  }

  // 조각(파편) 튀기기 — 텍스처 없이 도형으로
  burst(x, y, color, count = 12, speed = 180, size = 5) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = speed * (0.4 + Math.random() * 0.8);
      const s = size * (0.6 + Math.random() * 0.8);
      const p = this.scene.add.triangle(x, y, 0, 0, s, s * 0.3, s * 0.2, s, color).setDepth(40);
      p.rotation = Math.random() * Math.PI;
      this.scene.tweens.add({
        targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, rotation: p.rotation + Phaser.Math.FloatBetween(-6, 6),
        alpha: 0, duration: 500 + Math.random() * 400, ease: 'Cubic.easeOut', onComplete: () => p.destroy(),
      });
    }
  }

  ring(x, y, color, radius = 60, duration = 400) {
    const c = this.scene.add.circle(x, y, 8, color, 0).setStrokeStyle(4, color, 1).setDepth(40);
    this.scene.tweens.add({
      targets: c, radius, alpha: 0, duration, ease: 'Quad.easeOut',
      onUpdate: () => c.setRadius(c.radius), onComplete: () => c.destroy(),
    });
  }
}
