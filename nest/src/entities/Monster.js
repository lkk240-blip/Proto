import Phaser from 'phaser';
import { CONFIG } from '../config.js';

// 플레이어 몬스터. 물리 몸체(Matter 원)와 겉모습(도형 컨테이너)을 따로 두고 매 프레임 위치를 맞춘다.
export default class Monster {
  constructor(scene, x, y, typeKey) {
    this.scene = scene;
    this.typeKey = typeKey;
    this.type = CONFIG.monsterTypes[typeKey];
    this.radius = CONFIG.monster.radius * this.type.radiusMul;

    this.body = scene.matter.add.circle(x, y, this.radius, {
      friction: 0,
      frictionStatic: 0,
      frictionAir: 0,
      restitution: 0,
      inertia: Infinity, // 몸체가 굴러가며 회전하지 않도록
      label: `monster:${typeKey}`,
    });

    this.facing = new Phaser.Math.Vector2(1, 0);
    this.controls = null;       // KeyboardControls 등 "의도"를 주는 객체
    this.dashCharges = CONFIG.monster.dashCharges;
    this.dashRechargeTimer = 0; // 다음 충전까지 남은 시간
    this.dashTimer = 0;         // 대시 남은 시간
    this.trailTimer = 0;

    this.buildVisual();
  }

  buildVisual() {
    const s = this.scene;
    const r = this.radius;
    this.view = s.add.container(this.body.position.x, this.body.position.y).setDepth(10);

    this.shadow = s.add.ellipse(0, r * 0.7, r * 2, r * 0.8, 0x000000, 0.35);
    this.gfx = s.add.graphics();
    this.drawBody();

    this.label = s.add.text(0, -r - 16, this.type.name, {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.view.add([this.shadow, this.gfx, this.label]);
  }

  drawBody() {
    const g = this.gfx;
    const r = this.radius;
    const outline = this.typeKey === 'kkaburi' ? 0x555555 : 0x3b2412;
    g.clear();
    g.fillStyle(this.type.color, 1);
    g.lineStyle(3, outline, 1);
    g.fillCircle(0, 0, r);
    g.strokeCircle(0, 0, r);
    if (this.typeKey === 'kkaburi') {
      // 뿔: 진행 방향 쪽 삼각형 (회전은 gfx 전체 회전으로 처리)
      g.fillStyle(0xffd24d, 1);
      g.fillTriangle(r * 0.6, -r * 0.35, r * 0.6, r * 0.35, r * 1.55, 0);
    }
    // 눈 = 방향 표시
    g.fillStyle(0x000000, 1);
    g.fillCircle(r * 0.45, -r * 0.3, r * 0.14);
    g.fillCircle(r * 0.45, r * 0.3, r * 0.14);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  speed() {
    return CONFIG.monster.baseSpeed * this.type.speedMul;
  }

  update(dt) {
    const M = CONFIG.monster;
    const move = this.controls ? this.controls.getMove() : { x: 0, y: 0 };
    if (move.x || move.y) this.facing.set(move.x, move.y);

    // 대시 충전 (한 번에 1개씩)
    if (this.dashCharges < M.dashCharges) {
      this.dashRechargeTimer -= dt;
      if (this.dashRechargeTimer <= 0) {
        this.dashCharges++;
        this.dashRechargeTimer = this.dashCharges < M.dashCharges ? M.dashRecharge : 0;
      }
    }

    if (this.controls && this.controls.justPressed('dash')) this.tryDash();

    // Matter 속도 단위는 "픽셀/스텝(1/60초)" → 픽셀/초 값을 60으로 나눈다.
    const v = this.body.velocity;
    let tx, ty, k;
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      tx = this.facing.x * M.dashSpeed;
      ty = this.facing.y * M.dashSpeed;
      k = 1;
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) { this.spawnAfterimage(); this.trailTimer = 0.025; }
    } else {
      tx = move.x * this.speed();
      ty = move.y * this.speed();
      k = M.accel;
    }
    const nx = Phaser.Math.Linear(v.x, tx / 60, k);
    const ny = Phaser.Math.Linear(v.y, ty / 60, k);
    this.scene.matter.body.setVelocity(this.body, { x: nx, y: ny });

    this.syncView(dt);
  }

  tryDash() {
    if (this.dashCharges <= 0 || this.dashTimer > 0) return false;
    if (this.dashCharges === CONFIG.monster.dashCharges) this.dashRechargeTimer = CONFIG.monster.dashRecharge;
    this.dashCharges--;
    this.dashTimer = CONFIG.monster.dashDuration;
    this.scene.noise.emit(this.x, this.y, CONFIG.monster.dashNoise, 'dash');
    // 찌그러졌다 펴지는 연출
    this.scene.tweens.add({ targets: this.gfx, scaleX: 1.35, scaleY: 0.7, duration: 60, yoyo: true });
    return true;
  }

  spawnAfterimage() {
    const ghost = this.scene.add.circle(this.x, this.y, this.radius, this.type.color, 0.35).setDepth(9);
    this.scene.tweens.add({ targets: ghost, alpha: 0, scale: 0.6, duration: 220, onComplete: () => ghost.destroy() });
  }

  syncView() {
    this.view.setPosition(this.x, this.y);
    const target = Math.atan2(this.facing.y, this.facing.x);
    this.gfx.rotation = Phaser.Math.Angle.RotateTo(this.gfx.rotation, target, 0.35);
  }
}
