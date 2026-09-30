import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CAT, MASK } from '../systems/physics.js';
import { Sfx } from '../systems/Sfx.js';

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
      label: 'monster',
      collisionFilter: { category: CAT.MONSTER, mask: MASK.MONSTER, group: 0 },
    });
    this.body.gameMonster = this;

    this.facing = new Phaser.Math.Vector2(1, 0);
    this.controls = null;       // PlayerControls 또는 동료 AI — "의도"를 주는 객체
    this.controlled = false;    // 1인 모드에서 지금 플레이어가 조작 중인지
    this.dashCooldown = 0;      // 남은 대시 쿨타임(0이면 사용 가능)
    this.dashTimer = 0;
    this.trailTimer = 0;

    // 알 관련 상태
    this.carrying = null;       // 들고 있는 작은 알
    // 고유 스킬이 꺼져 있으면 까부리도 손으로 든다(감속 있음)
    this.carryMode = typeKey === 'kkaburi' && CONFIG.features.uniqueSkills ? 'horn' : 'hands';
    this.belly = null;          // 삼킨 작은 알(꿀떡이)
    this.bellyTime = 0;
    this.pushing = null;        // 밀고 있는 큰 알(EggSystem 이 매 프레임 갱신)
    this.extracting = null;     // 둥지에서 알 꺼내는 중
    this.fatigue = 0;           // 알을 오래 들면 쌓이는 피로도 0~1

    this.stunTimer = 0;
    this.graceTimer = 0;
    this.hp = this.maxHp;
    this.downed = false;        // 체력 0: 쓰러짐(동료가 부활시켜야 함)
    this.reviveProgress = 0;    // 0~1, 동료가 부활시키는 중
    this.statusText = '';       // 머리 위 상태 표시(예: "대기")
    this.tag = '';              // 이름 옆 표시(예: "P1")

    this.buildVisual();
  }

  get maxHp() { return this.type.maxHp ?? CONFIG.monster.maxHp; }
  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  // 쓰러진 것도 "행동 불가"로 취급(잡히지 않음, 조작·줍기 불가)
  get stunned() { return this.stunTimer > 0 || this.downed; }
  get hasEgg() { return !!((this.carrying && !this.carrying.isStone) || this.belly || this.pushing || this.pulling); }

  canHold() {
    return !this.stunned && !this.carrying && !this.extracting;
  }

  buildVisual() {
    const s = this.scene;
    const r = this.radius;
    this.view = s.add.container(this.x, this.y).setDepth(10);

    this.ring = s.add.ellipse(0, r * 0.7, r * 2.8, r * 1.2).setStrokeStyle(3, 0x7cf0ff, 0.9).setVisible(false);
    this.shadow = s.add.ellipse(0, r * 0.7, r * 2, r * 0.8, 0x000000, 0.35);
    this.bodyC = s.add.container(0, 0); // 떨림/회전 연출용
    this.gfx = s.add.graphics();
    this.bellyGfx = s.add.graphics();
    this.bodyC.add([this.gfx, this.bellyGfx]);
    this.drawBody();

    const textStyle = { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 };
    this.label = s.add.text(0, -r - 16, this.type.name, textStyle).setOrigin(0.5);
    this.status = s.add.text(0, -r - 34, '', { ...textStyle, fontSize: '15px', color: '#9fe8ff', fontStyle: 'bold' }).setOrigin(0.5);
    this.stars = s.add.text(0, -r - 8, '★ ★ ★', { ...textStyle, fontSize: '16px', color: '#ffe14d' }).setOrigin(0.5).setVisible(false);

    this.hpG = s.add.graphics();
    this.view.add([this.ring, this.shadow, this.bodyC, this.label, this.status, this.stars, this.hpG]);
  }

  drawBody() {
    const g = this.gfx;
    const r = this.radius;
    const outline = this.typeKey === 'kkaburi' ? 0x555555 : 0x3b2412;
    g.clear();
    if (this.typeKey === 'kkaburi') {
      // 뿔: 진행 방향 쪽 삼각형 (회전은 몸 전체 회전으로 처리)
      g.fillStyle(0xffd24d, 1);
      g.lineStyle(2, 0x8a6a10, 1);
      g.fillTriangle(r * 0.6, -r * 0.4, r * 0.6, r * 0.4, r * 1.6, 0);
      g.strokeTriangle(r * 0.6, -r * 0.4, r * 0.6, r * 0.4, r * 1.6, 0);
      // 뾰족한 몸 테두리 느낌
      g.fillStyle(this.type.color, 1);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.4 + i * (Math.PI * 1.2 / 5);
        g.fillTriangle(Math.cos(a - 0.25) * r * 0.9, Math.sin(a - 0.25) * r * 0.9, Math.cos(a + 0.25) * r * 0.9, Math.sin(a + 0.25) * r * 0.9, Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
      }
    }
    g.fillStyle(this.type.color, 1);
    g.lineStyle(3, outline, 1);
    g.fillCircle(0, 0, r);
    g.strokeCircle(0, 0, r);
    // 눈 = 방향 표시
    g.fillStyle(0x000000, 1);
    g.fillCircle(r * 0.45, -r * 0.3, r * 0.14);
    g.fillCircle(r * 0.45, r * 0.3, r * 0.14);
  }

  drawBelly() {
    const g = this.bellyGfx;
    g.clear();
    if (!this.belly) return;
    const r = this.radius;
    // 불룩한 배 + 비치는 알 모양
    g.fillStyle(0xb07a45, 1);
    g.lineStyle(3, 0x3b2412, 1);
    g.fillCircle(-r * 0.3, 0, r * 0.6);
    g.strokeCircle(-r * 0.3, 0, r * 0.6);
    g.lineStyle(2, 0xfff1d0, 0.8);
    g.strokeEllipse(-r * 0.3, 0, r * 0.55, r * 0.75);
  }

  // 머리 위 체력 칸 + 부활 진행 링
  drawHp() {
    const g = this.hpG;
    g.clear();
    const n = this.maxHp, w = 9, gap = 3;
    const x0 = -(n * w + (n - 1) * gap) / 2, y = this.radius + 8;
    for (let i = 0; i < n; i++) {
      g.fillStyle(0x000000, 0.6).fillRect(x0 + i * (w + gap) - 1, y - 1, w + 2, 7);
      g.fillStyle(i < this.hp ? 0xff5d6c : 0x3a3a3a, 1).fillRect(x0 + i * (w + gap), y, w, 5);
    }
    // 피로도(알을 오래 들면 차오름, 가득 차면 떨어뜨림)
    if (this.fatigue > 0.01) {
      const fw = n * w + (n - 1) * gap, fy = y + 8;
      g.fillStyle(0x000000, 0.6).fillRect(x0 - 1, fy - 1, fw + 2, 5);
      g.fillStyle(this.fatigue > 0.75 ? 0xff7b3a : 0xffd23f, 1).fillRect(x0, fy, fw * this.fatigue, 3);
    }
    if (this.downed && this.reviveProgress > 0) {
      g.lineStyle(4, 0x8cf5a8, 1);
      g.beginPath();
      g.arc(0, 0, this.radius + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.reviveProgress);
      g.strokePath();
    }
  }

  speed() {
    let s = CONFIG.monster.baseSpeed * this.type.speedMul;
    if (this.carrying && this.carryMode === 'hands') s *= 1 - CONFIG.egg.carrySmallSlow;
    // 오래 들고 있을수록 점점 느려짐
    if (this.carrying && !this.carrying.isStone) s *= 1 - this.fatigue * CONFIG.carry.slowMax;
    if (this.pulling) s *= CONFIG.bigEgg.pullSpeedMul; // 큰 알 당기는 중
    if (this.hurry) s *= 1.3; // 동료 AI가 밀기를 도우러 달려올 때
    if (this.pushing) s = (this.pushing.pushSpeedTarget || s * CONFIG.bigEgg.pushSpeedMul) + 12; // 알 속도 + 약간(계속 붙어 있게)
    return s;
  }

  setVelocityPx(vx, vy) {
    // Matter 속도 단위는 "픽셀/스텝(1/60초)" → 픽셀/초 값을 60으로 나눈다.
    this.scene.matter.body.setVelocity(this.body, { x: vx / 60, y: vy / 60 });
  }

  update(dt) {
    const M = CONFIG.monster;

    // 대시 쿨타임
    if (this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
      if (this.dashCooldown === 0 && this.controlled) this.scene.fx.ring(this.x, this.y, 0x7cf0ff, this.radius + 14, 250);
    }
    this.graceTimer = Math.max(0, this.graceTimer - dt);

    const v = this.body.velocity;
    if (this.downed) {
      const damp = Math.pow(0.88, dt * 60);
      this.scene.matter.body.setVelocity(this.body, { x: v.x * damp, y: v.y * damp });
    } else if (this.stunned) {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) {
        this.stunTimer = 0;
        this.graceTimer = M.graceTime;
        this.bodyC.rotation = 0;
      }
      // 튕겨 나간 속도가 점점 줄어듦
      const damp = Math.pow(0.9, dt * 60);
      this.scene.matter.body.setVelocity(this.body, { x: v.x * damp, y: v.y * damp });
    } else {
      // 둥지에서 꺼내는 중에는 제자리(움직이려 하면 NestSystem 이 취소)
      const move = this.controls && !this.extracting ? this.controls.getMove() : { x: 0, y: 0 };
      if (move.x || move.y) this.facing.set(move.x, move.y).normalize();
      if (this.controls && this.controls.justPressed('dash')) this.tryDash();

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
        k = 1 - Math.pow(1 - M.accel, dt * 60);
      }
      this.setVelocityPx(Phaser.Math.Linear(v.x * 60, tx, k), Phaser.Math.Linear(v.y * 60, ty, k));
    }

    this.syncView();
  }

  tryDash() {
    if (this.dashCooldown > 0 || this.dashTimer > 0 || this.extracting) return false;
    this.dashCooldown = CONFIG.monster.dashCooldown;
    this.dashTimer = CONFIG.monster.dashDuration;
    this.scene.noise.emit(this.x, this.y, CONFIG.monster.dashNoise, 'dash');
    Sfx.dash();
    // 찌그러졌다 펴지는 연출
    this.scene.tweens.add({ targets: this.gfx, scaleX: 1.35, scaleY: 0.7, duration: 60, yoyo: true });
    this.scene.eggs.onDash(this);
    return true;
  }

  spawnAfterimage() {
    const ghost = this.scene.add.circle(this.x, this.y, this.radius, this.type.color, 0.35).setDepth(9);
    this.scene.tweens.add({ targets: ghost, alpha: 0, scale: 0.6, duration: 220, onComplete: () => ghost.destroy() });
  }

  // 경비·추격자에게 잡힘: 크게 튕겨 나가며 빙글 돌고 기절, 들고 있던 알을 떨어뜨린다.
  stun(fromX, fromY, damage = CONFIG.monster.guardDamage) {
    if (this.stunned || this.graceTimer > 0) return false;
    const M = CONFIG.monster;
    this.scene.eggs.dropAllOnHit(this);
    this.hp = Math.max(0, this.hp - damage);
    if (this.hp <= 0) {
      this.downed = true;
      this.stunTimer = 0;
    } else {
      this.stunTimer = M.stunTime;
    }
    this.dashTimer = 0;
    const dir = new Phaser.Math.Vector2(this.x - fromX, this.y - fromY);
    if (dir.lengthSq() < 1) dir.set(Math.random() - 0.5, Math.random() - 0.5);
    dir.normalize();
    this.setVelocityPx(dir.x * M.knockbackSpeed, dir.y * M.knockbackSpeed);
    this.scene.tweens.add({ targets: this.bodyC, rotation: Math.PI * 6, duration: 900, ease: 'Cubic.easeOut' });
    this.scene.fx.popText(this.x, this.y - this.radius - 20, this.downed ? '꽥... (쓰러짐)' : `으악! -${damage}`, { color: '#ff8a8a', size: 26 });
    this.scene.fx.shake(250, 0.012);
    this.scene.fx.burst(this.x, this.y, 0xffffff, 8, 140, 5);
    this.scene.stats.caught++;
    if (this.downed) {
      this.scene.stats.downs++;
      this.scene.tweens.add({ targets: this.bodyC, scaleY: 0.55, duration: 400, delay: 700 });
      this.scene.onMonsterDowned(this);
    }
    Sfx.caught();
    return true;
  }

  revive() {
    this.downed = false;
    this.hp = CONFIG.monster.reviveHp;
    this.reviveProgress = 0;
    this.graceTimer = CONFIG.monster.graceTime;
    this.bodyC.rotation = 0;
    this.scene.tweens.killTweensOf(this.bodyC);
    this.bodyC.setScale(1);
    this.scene.fx.popText(this.x, this.y - this.radius - 24, '부활!', { color: '#8cf5a8', size: 28 });
    this.scene.fx.ring(this.x, this.y, 0x8cf5a8, 60, 400);
    Sfx.deposit();
  }

  syncView() {
    const r = this.radius;
    this.view.setPosition(this.x, this.y);
    if (!this.stunned) {
      const target = Math.atan2(this.facing.y, this.facing.x);
      this.gfx.rotation = Phaser.Math.Angle.RotateTo(this.gfx.rotation, target, 0.35);
      this.bellyGfx.rotation = this.gfx.rotation;
    }
    // 삼킨 알 경고 떨림
    const warn = this.belly && this.bellyTime >= CONFIG.kkuldduk.swallowWarn;
    this.bodyC.x = warn ? Phaser.Math.FloatBetween(-3, 3) : 0;
    this.bodyC.y = warn ? Phaser.Math.FloatBetween(-2, 2) : 0;
    const bellyScale = this.belly ? 1.18 : 1;
    // 걸을 때 통통 튀는 느낌(찌그러짐)
    const spd = Math.hypot(this.body.velocity.x, this.body.velocity.y) * 60;
    const bob = !this.stunned && spd > 30 ? Math.sin(this.scene.time.now * 0.025) * 0.07 : 0;
    this.bodyC.setScale(bellyScale * (1 - bob * 0.5), bellyScale * (1 + bob));

    this.stars.setVisible(this.stunTimer > 0 && !this.downed);
    if (this.stunned) this.stars.rotation = Math.sin(this.scene.time.now * 0.01) * 0.3;
    const hideAlpha = this.inBush ? CONFIG.bush.monsterAlpha : 1;
    this.view.alpha = (this.graceTimer > 0 ? (Math.floor(this.scene.time.now / 80) % 2 ? 0.4 : 1) : 1) * hideAlpha;
    this.view.setDepth(this.inBush ? 15 : 10); // 숨어 있어도 내 몬스터는 잎 위에 반투명으로
    this.label.setText((this.tag ? `${this.tag} ` : '') + this.type.name + (this.inBush ? ' (숨음)' : ''));

    this.ring.setVisible(this.controlled);
    let st = this.statusText;
    if (this.belly) {
      const left = Math.max(0, CONFIG.kkuldduk.swallowLimit - this.bellyTime);
      st = warn ? `우웩 직전! ${left.toFixed(0)}` : `꿀꺽 ${left.toFixed(0)}`;
      this.status.setColor(warn ? '#ff6b6b' : '#ffd79a');
    } else {
      this.status.setColor('#9fe8ff');
    }
    if (this.downed) {
      st = this.reviveProgress > 0 ? `부활 중 ${Math.round(this.reviveProgress * 100)}%` : '쓰러짐 — 동료가 E로 부활';
      this.status.setColor('#ff8a8a');
    }
    this.status.setText(st);
    this.drawHp();
    const carryUp = this.carrying && this.carryMode === 'hands' ? 22 : 0;
    this.label.y = -r * bellyScale - 16 - carryUp;
    this.status.y = -r * bellyScale - 34 - carryUp;
  }
}
