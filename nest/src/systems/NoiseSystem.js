import { CONFIG } from '../config.js';

// 소음 이벤트: 발생 지점에 반투명 원형 파동을 그리고, 구독자(경비 등, M3)에게 알린다.
export default class NoiseSystem {
  constructor(scene) {
    this.scene = scene;
    this.listeners = [];
  }

  onNoise(fn) {
    this.listeners.push(fn);
  }

  emit(x, y, size, source = '') {
    const g = this.scene.add.graphics().setDepth(5);
    const dur = CONFIG.noise.rippleDuration * 1000;
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: dur,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(3, 0xffe066, 0.7 * (1 - state.t));
        g.strokeCircle(x, y, size * state.t);
        g.fillStyle(0xffe066, 0.12 * (1 - state.t));
        g.fillCircle(x, y, size * state.t);
      },
      onComplete: () => g.destroy(),
    });
    for (const fn of this.listeners) fn({ x, y, size, source });
  }
}
