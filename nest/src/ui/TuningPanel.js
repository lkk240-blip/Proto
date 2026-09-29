import { CONFIG, resetConfig, applyConfig } from '../config.js';
import { copyText } from '../systems/RunLog.js';

// 튜닝 패널(` 키): config.js 의 주요 수치를 슬라이더로 실시간 조정. HTML 로 만들어 게임 위에 띄운다.
// [섹션, 키, 표시 이름, 최소, 최대, 간격]
const FIELDS = [
  ['몬스터'],
  ['monster', 'baseSpeed', '몬스터 기본 속도', 60, 400, 5],
  ['monster', 'accel', '이동 반응성(가속)', 0.05, 1, 0.05],
  ['monster', 'dashRecharge', '대시 재충전(초)', 0.5, 20, 0.5],
  ['monster', 'dashSpeed', '대시 속도', 300, 1500, 50],
  ['알'],
  ['egg', 'carrySmallSlow', '작은 알 운반 감속', 0, 0.8, 0.05],
  ['bigEgg', 'coopSlow', '공동 운반 감속', 0, 0.9, 0.05],
  ['bigEgg', 'coopAccel', '공동 운반 가속(관성)', 0.01, 0.5, 0.01],
  ['bigEgg', 'coopTurnRate', '공동 운반 회전 속도', 0.2, 6, 0.1],
  ['bigEgg', 'dragSlow', '질질 끌기 감속', 0, 0.95, 0.05],
  ['egg', 'impactSpeed', '충격 임계 속도', 100, 900, 10],
  ['egg', 'landCrackSpeed', '던지기 착지 금 임계', 100, 700, 10],
  ['egg', 'throwSpeed', '던지기 속도', 100, 800, 10],
  ['kkuldduk', 'swallowLimit', '삼킴 제한 시간(초)', 5, 60, 1],
  ['경비'],
  ['guard', 'patrolSpeed', '경비 순찰 속도', 30, 300, 5],
  ['guard', 'chaseSpeed', '경비 추격 속도', 60, 400, 5],
  ['guard', 'visionAngle', '경비 시야 각도(도)', 20, 180, 5],
  ['guard', 'visionRange', '경비 시야 거리', 60, 500, 10],
  ['guard', 'sightRate', '의심 상승률(초당)', 10, 400, 10],
  ['guard', 'hearingMul', '소음→의심 배율', 0, 1.5, 0.05],
  ['소란도 · 추격자'],
  ['tension', 'pickupSmall', '작은 알 줍기 +', 0, 40, 1],
  ['tension', 'pickupBig', '큰 알 들기 +', 0, 60, 1],
  ['tension', 'chaseStart', '경비 추격 시작 +', 0, 50, 1],
  ['tension', 'eggBreak', '알 깨짐 +', 0, 50, 1],
  ['tension', 'noiseMul', '소음 크기 × (소란도)', 0, 0.1, 0.005],
  ['chaser', 'speed', '추격자 속도', 60, 400, 5],
  ['런'],
  ['run', 'timeLimit', '제한 시간(초)', 30, 900, 10],
  ['run', 'quota', '할당량', 1, 20, 0.5],
  ['vision', 'radius', '플레이어 시야 반경', 120, 800, 10],
  ['vision', 'fogAlpha', '안개 어둡기', 0, 1, 0.02],
];

const DEBUG = [
  ['showCones', '경비 시야 원뿔 항상 표시(안개 속에서도)'],
  ['noFog', '안개 끄기'],
  ['showSuspicion', '의심 게이지 숫자 표시'],
];

export default class TuningPanel {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'tuning';
    this.el.hidden = true;
    this.el.innerHTML = `<style>
      #tuning{position:fixed;top:0;right:0;width:360px;max-width:100%;height:100%;overflow:auto;background:rgba(18,20,26,.94);color:#e6e6e6;
        font:13px/1.35 sans-serif;z-index:500;padding:12px 14px;box-sizing:border-box;border-left:2px solid #333}
      #tuning h2{margin:0 0 6px;font-size:17px;color:#ffd166}
      #tuning h3{margin:14px 0 6px;font-size:13px;color:#9fc3ff;border-bottom:1px solid #333;padding-bottom:3px}
      #tuning .row{display:grid;grid-template-columns:1fr 64px;gap:2px 8px;align-items:center;margin-bottom:6px}
      #tuning .row label{grid-column:1/3;color:#bbb}
      #tuning input[type=range]{width:100%}
      #tuning input[type=number]{width:64px;background:#111;color:#fff;border:1px solid #444;padding:2px}
      #tuning .btns{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
      #tuning button{background:#2f6fd6;color:#fff;border:0;padding:6px 9px;border-radius:4px;cursor:pointer;font-size:12px}
      #tuning button.gray{background:#555b66}
      #tuning textarea{width:100%;height:110px;background:#111;color:#ddd;border:1px solid #444;font-size:11px;box-sizing:border-box}
      #tuning .chk{display:flex;gap:6px;align-items:center;margin:4px 0}
      #tuning .msg{color:#9fe8ff;min-height:16px}
      #tuning .note{color:#888;font-size:11px}
    </style>
    <h2>튜닝 패널 <span class="note">(\` 키로 닫기 · 바꾸면 즉시 반영)</span></h2>
    <div class="btns">
      <button data-act="copy">설정 복사(JSON)</button>
      <button data-act="paste">설정 붙여넣기</button>
      <button data-act="reset" class="gray">기본값 복원</button>
    </div>
    <div class="paste" hidden>
      <textarea placeholder="복사해 둔 설정 JSON을 여기에 붙여넣고 [적용]을 누르세요"></textarea>
      <div class="btns"><button data-act="apply">적용</button><button data-act="cancel" class="gray">취소</button></div>
    </div>
    <div class="msg"></div>
    <h3>디버그</h3>
    <div class="debug"></div>
    <div class="fields"></div>
    <p class="note">슬라이더에 없는 수치는 src/config.js 에서 바꿀 수 있어요. 몬스터 크기 등 일부는 다음 판부터 반영됩니다.</p>`;
    document.body.appendChild(this.el);

    this.msg = this.el.querySelector('.msg');
    this.pasteBox = this.el.querySelector('.paste');
    this.buildDebug();
    this.buildFields();

    this.el.addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (act) this.onAction(act);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Backquote') return;
      const t = e.target;
      const typing = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'number'));
      if (typing) return;
      e.preventDefault();
      this.toggle();
    });
  }

  toggle() {
    this.el.hidden = !this.el.hidden;
    if (!this.el.hidden) this.refresh();
    else if (document.activeElement && this.el.contains(document.activeElement)) document.activeElement.blur();
  }

  buildDebug() {
    const box = this.el.querySelector('.debug');
    for (const [k, label] of DEBUG) {
      const id = `dbg-${k}`;
      const row = document.createElement('label');
      row.className = 'chk';
      row.innerHTML = `<input type="checkbox" id="${id}"> ${label}`;
      const cb = row.querySelector('input');
      cb.addEventListener('change', () => { CONFIG.debug[k] = cb.checked; });
      box.appendChild(row);
    }
  }

  buildFields() {
    const box = this.el.querySelector('.fields');
    this.inputs = [];
    for (const f of FIELDS) {
      if (f.length === 1) {
        const h = document.createElement('h3');
        h.textContent = f[0];
        box.appendChild(h);
        continue;
      }
      const [sec, key, label, min, max, step] = f;
      const id = `cfg-${sec}-${key}`;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<label for="${id}">${label} <span class="note">${sec}.${key}</span></label>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}">
        <input type="number" id="${id}-n" min="${min}" max="${max}" step="${step}">`;
      const range = row.querySelector('input[type=range]');
      const num = row.querySelector('input[type=number]');
      const set = (v) => {
        const n = parseFloat(v);
        if (Number.isNaN(n)) return;
        CONFIG[sec][key] = n;
        range.value = n;
        num.value = n;
      };
      range.addEventListener('input', () => set(range.value));
      num.addEventListener('change', () => set(num.value));
      this.inputs.push({ sec, key, range, num });
      box.appendChild(row);
    }
  }

  refresh() {
    for (const { sec, key, range, num } of this.inputs) {
      range.value = CONFIG[sec][key];
      num.value = CONFIG[sec][key];
    }
    for (const [k] of DEBUG) this.el.querySelector(`#dbg-${k}`).checked = !!CONFIG.debug[k];
  }

  say(text) {
    this.msg.textContent = text;
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => { this.msg.textContent = ''; }, 3000);
  }

  async onAction(act) {
    if (act === 'copy') {
      const ok = await copyText(JSON.stringify(CONFIG, null, 2));
      this.say(ok ? '설정을 클립보드에 복사했어요.' : '자동 복사가 막혀서 복사 창을 열었어요.');
    } else if (act === 'paste') {
      this.pasteBox.hidden = false;
      this.pasteBox.querySelector('textarea').focus();
    } else if (act === 'cancel') {
      this.pasteBox.hidden = true;
    } else if (act === 'apply') {
      const text = this.pasteBox.querySelector('textarea').value;
      try {
        // 기록 복사 텍스트를 통째로 붙여넣어도 JSON 부분만 찾아서 적용
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        applyConfig(JSON.parse(text.slice(start, end + 1)));
        this.refresh();
        this.pasteBox.hidden = true;
        this.say('설정을 적용했어요.');
      } catch (e) {
        this.say('JSON을 읽지 못했어요. 설정 복사로 만든 텍스트 전체를 붙여넣어 주세요.');
      }
    } else if (act === 'reset') {
      resetConfig();
      this.refresh();
      this.say('기본값으로 되돌렸어요.');
    }
  }
}
