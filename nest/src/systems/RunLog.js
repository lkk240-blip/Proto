import { CONFIG } from '../config.js';

// 누적 판 수(localStorage) — 저장이 막힌 환경에서도 게임은 동작하도록 try/catch
const KEY = 'nest_proto_runs';

export function getRunCount() {
  try {
    return parseInt(localStorage.getItem(KEY) || '0', 10) || 0;
  } catch (e) {
    return 0;
  }
}

export function incrementRunCount() {
  const n = getRunCount() + 1;
  try {
    localStorage.setItem(KEY, String(n));
  } catch (e) {
    /* 저장 불가 환경 — 무시 */
  }
  return n;
}

const sec = (s) => `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`;

export function buildRecordText(r) {
  const s = r.stats;
  const lines = [
    '[Nest 프로토타입 기록]',
    `일시: ${new Date().toLocaleString('ko-KR')}`,
    `누적 판 수: ${r.runNumber}`,
    `모드: ${r.mode === 'duo' ? '2인' : '1인'}`,
    `결과: ${r.success ? '성공' : '실패'} (${r.reason})`,
    `확보 가치: ${r.secured.toFixed(2)} / 할당량 ${r.quota}`,
    `입금한 알 수: ${s.deposited}`,
    `금 간 횟수: ${s.cracks}`,
    `깨뜨린 알 수: ${s.broken}`,
    `괴수에게 잡힌 횟수: ${s.caught}`,
    `쓰러진 횟수: ${s.downs}`,
    `우두머리 깨운 횟수: ${s.bossWakes}`,
    `둥지에서 꺼낸 알: ${s.extracted}`,
    `타이밍 체크: 대성공 ${s.checkGreat} / 성공 ${s.checkGood} / 실패 ${s.checkFails}`,
    `큰 알 민 시간: ${s.pushTime.toFixed(1)}초`,
    `팔 저려 떨어뜨림: ${s.fatigueDrops}`,
    `괴수 명중: ${s.enemyHits}`,
    `부서진 돌: ${s.stonesBroken || 0}`,
    `교체 횟수: ${s.swaps}`,
    `던지기/받기: ${s.throws}/${s.catches}`,
    `플레이 시간: ${sec(s.playTime)}`,
    '',
    '[테스터 질문]',
    '1. 큰 알을 굴려서 옮기는 게 재밌었나요, 답답했나요? → ',
    '2. 알이 깨질 때 웃겼나요, 짜증났나요? → ',
    '3. 몇 판 하고 그만뒀고, 왜 그만뒀나요? → ',
    '',
    '[설정(config)]',
    JSON.stringify(CONFIG),
  ];
  return lines.join('\n');
}

// 클립보드 복사. 막혀 있으면 텍스트 상자를 띄워 직접 복사하게 한다.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* 아래 대체 방법으로 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) return true;
  } catch (e) {
    /* 아래 대체 방법으로 */
  }
  showManualCopy(text);
  return false;
}

export function showManualCopy(text) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:grid;place-items:center;z-index:1000;padding:16px';
  wrap.innerHTML = `<div style="background:#1d2027;color:#eee;padding:16px;border-radius:8px;width:min(640px,100%);font-family:sans-serif;display:grid;gap:10px">
    <b>자동 복사가 막혀 있어요. 아래 내용을 전체 선택(Ctrl+A) 후 복사(Ctrl+C)하세요.</b>
    <textarea id="manual-copy" style="width:100%;height:300px;background:#111;color:#ddd;border:1px solid #444;font-size:12px"></textarea>
    <button id="manual-copy-close" style="padding:8px;font-size:14px;cursor:pointer">닫기</button></div>`;
  document.body.appendChild(wrap);
  const ta = wrap.querySelector('#manual-copy');
  ta.value = text;
  ta.focus();
  ta.select();
  wrap.querySelector('#manual-copy-close').onclick = () => wrap.remove();
}
