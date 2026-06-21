// ═══ 차트술사 구조론 분석 도구 v2 ═══
// 체결→거래량→종가→사건봉→박스→도지→기능선→지지저항전환→매매시나리오

(function(){

var _ctTab = 'chart';
var _ctSymbol = 'KRX:005930';
var _ctInterval = 'D';
var _tvLoaded = false;

// ── 메인 진입 ──
window.showChart = function(){
  var wrap = document.getElementById('chartwrap');
  if(!wrap) return;
  _tvLoaded = false;
  wrap.innerHTML = buildCSS() + buildHero() + buildTabBar() + buildTabContent();
  window._ctSwitchTab(_ctTab);
};

// ── 탭 전환 ──
window._ctSwitchTab = function(id){
  _ctTab = id;
  document.querySelectorAll('.ct-tab').forEach(function(b){ b.classList.toggle('on', b.dataset.t===id); });
  document.querySelectorAll('.ct-pane').forEach(function(c){ c.style.display = c.dataset.pane===id ? 'block' : 'none'; });
  if(id==='chart' && !_tvLoaded){ setTimeout(initTV, 250); _tvLoaded=true; }
};

// ── TradingView 초기화 ──
function initTV(){
  var isDark = !document.body.classList.contains('light');
  var container = document.getElementById('ct-tv-box');
  if(!container) return;
  container.innerHTML = '';
  var s = document.createElement('script');
  s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  s.async = true;
  s.textContent = JSON.stringify({
    autosize:true, symbol:_ctSymbol, interval:_ctInterval,
    timezone:'Asia/Seoul', theme:isDark?'dark':'light',
    style:'1', locale:'kr', withdateranges:true,
    hide_side_toolbar:false, allow_symbol_change:true,
    details:true, support_host:'https://www.tradingview.com'
  });
  container.appendChild(s);
}

// ── 심볼 변경 ──
window._ctChangeSymbol = function(){
  var sym = document.getElementById('ct-sym-input').value.trim().toUpperCase();
  var intSel = document.getElementById('ct-int-select');
  if(intSel) _ctInterval = intSel.value;
  if(!sym) return;
  if(/^\d+$/.test(sym)) sym = 'KRX:'+sym;
  else if(!sym.includes(':')) sym = 'KRX:'+sym;
  _ctSymbol = sym; _tvLoaded = false;
  var box = document.getElementById('ct-tv-box');
  if(box) box.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--mt);font-size:13px">차트 로딩 중...</div>';
  setTimeout(function(){ initTV(); _tvLoaded=true; }, 50);
};

// ── 분석 실행 ──
window._ctAnalyze = function(){
  var f = function(id){ return parseFloat(document.getElementById(id).value)||0; };
  var s = function(id){ return document.getElementById(id).value; };
  var data = {
    structure:  s('ct-structure'),
    frame:      s('ct-frame'),
    currentPrice: f('ct-price'),
    boxUpper:   f('ct-box-upper'),
    boxClose:   f('ct-box-close'),
    boxLower:   f('ct-box-lower'),
    dojiUpper:  f('ct-doji-upper'),
    dojiClose:  f('ct-doji-close'),
    dojiLower:  f('ct-doji-lower'),
    dojiType:   s('ct-doji-type'),
    eventClose: f('ct-event-close'),
    volLevel:   s('ct-vol'),
    volContext: s('ct-vol-context'),
    gap:        s('ct-gap'),
    retest:     s('ct-retest'),
    note:       s('ct-note')
  };
  var result = generateAnalysis(data);
  document.getElementById('ct-output').innerHTML = result;
  document.getElementById('ct-output').scrollIntoView({behavior:'smooth', block:'start'});
};

// ══════════════════════════════════════
// ── 분석 엔진 ──
// ══════════════════════════════════════
function generateAnalysis(d){
  var p  = d.currentPrice || 0;
  var bu = d.boxUpper  || 0, bl = d.boxLower  || 0;
  var bc = d.boxClose  || 0;
  var du = d.dojiUpper || 0, dl = d.dojiLower || 0, dc = d.dojiClose || 0;
  var ec = d.eventClose || 0;

  if(!p && !bu && !bl && !du && !dl){
    return '<div style="padding:16px;color:#f59e0b;font-size:13px">⚠ 현재 가격과 박스 또는 도지 경계를 입력해 주세요.</div>';
  }

  var hasDoji = du>0 && dl>0 && dc>0;
  var hasBox  = bu>0 && bl>0;

  // bc=0 방어: 박스 중간값으로 자동 설정
  if(hasBox && bc===0) bc = Math.round((bu+bl)/2);

  // ── 기능선 격 ──
  var gradeMap = {monthly:'S급 (월봉)', weekly:'A급 (주봉)', daily:'B급 (일봉)', h4:'C급 (4시간)', h1:'C급 (1시간)'};
  var grade = gradeMap[d.frame] || 'B급 (일봉)';

  // ── 갭 해석 ──
  var gapText = '';
  var gapWarn = '';
  if(d.gap==='up-above'){
    gapText = '상승갭이 핵심 저항 위에서 발생 → 저항을 거래 없이 돌파 → 지지 전환 가능성 → 눌림 대기';
    gapWarn = '⚡ 갭이 저항을 넘겼으나 거래 없이 돌파됐으므로 리테스트(눌림) 필수 확인';
  } else if(d.gap==='up-below'){
    gapText = '상승갭이 핵심 저항 아래에서 발생 → 저항 미돌파 → 기존 저항 유지 → 관찰';
    gapWarn = '⚠ 갭 상승이었으나 저항을 넘지 못함. 저항 돌파 실패로 처리';
  } else if(d.gap==='down-below'){
    gapText = '하락갭이 핵심 지지 아래에서 발생 → 지지를 거래 없이 이탈 → 저항 전환 가능성 → 반등 매도 대기';
    gapWarn = '⚡ 갭이 지지를 이탈했으나 거래 없이 이탈됐으므로 리테스트(반등) 필수 확인';
  } else if(d.gap==='down-above'){
    gapText = '하락갭이 핵심 지지 위에서 발생 → 지지 미이탈 → 기존 지지 유지 → 관찰';
    gapWarn = '⚠ 갭 하락이었으나 지지를 이탈하지 못함. 지지 유효로 처리';
  }

  // ── 거래량 맥락 해석 ──
  var volText = '';
  var vl = d.volLevel, vc = d.volContext;
  if(vc==='breakout'){
    volText = vl==='high' ? '✅ 돌파 + 거래량 급증 → 수급 유입 확인. 돌파 신뢰도 높음' :
              vl==='low'  ? '⚠ 돌파 + 거래량 부족 → 거래량 없는 돌파. 신뢰도 낮음. 리테스트 필수' :
                            '📊 돌파 + 거래량 보통 → 부분 신뢰. 리테스트 확인 후 판단';
  } else if(vc==='pullback'){
    volText = vl==='low'  ? '✅ 눌림 + 거래량 감소 → 매도 압력 약화. 진입 타점 접근 중' :
              vl==='high' ? '⚠ 눌림 + 거래량 급증 → 매도 압력 강함. 추가 조정 가능성' :
                            '📊 눌림 + 거래량 보통 → 매도 압력 중립. 지지 확인 후 판단';
  } else if(vc==='breakdown'){
    volText = vl==='high' ? '✅ 이탈 + 거래량 급증 → 수급 이탈 확인. 이탈 신뢰도 높음' :
              vl==='low'  ? '⚠ 이탈 + 거래량 부족 → 신뢰도 낮음. 반등 여부 확인 필요' :
                            '📊 이탈 + 거래량 보통 → 부분 신뢰. 되돌림 확인 후 판단';
  } else if(vc==='bounce'){
    volText = vl==='low'  ? '✅ 반등 + 거래량 감소 → 매수 압력 약화. 매도 타점 접근 중' :
              vl==='high' ? '⚠ 반등 + 거래량 급증 → 매수세 유입. 반등 강도 주의' :
                            '📊 반등 + 거래량 보통 → 매수 압력 중립. 저항 확인 후 판단';
  } else {
    volText = vl==='high' ? '거래량 급증 → 수급 집중. 방향 확인 필요' :
              vl==='low'  ? '거래량 감소 → 참여자 관망. 추세 약화 신호' :
                            '거래량 보통 → 추세 확인 필요';
  }

  // ── 포지션 변수 ──
  var posStr='', recommendation='', scenarios=[], entries=[], stopLoss='', targets=[], finalJudge='';
  var supportCandidates=[], resistanceCandidates=[], removedCandidates=[];

  // ══════════════════════════
  // ─ 도지 기반 전략 ─
  // ══════════════════════════
  if(hasDoji){

    if(p >= dl && p <= du){
      // 도지 내부시점 — 박스매매
      if(p <= dc){
        posStr = '도지 내부 / 하단~종가 구간 (매수 우위)';
        recommendation = '도지 내부 매수 전략 (박스매매)';
        entries = ['1차 진입: '+dc+' 근처 (도지 종가)', '2차 진입: '+dl+' 근처 (도지 하단)'];
        stopLoss = dl+' 종가 이탈 시 실패 → 즉시 손절';
        targets  = ['1차 목표: '+du+' (도지 상단)', '2차 목표: 도지 상단 돌파 후 다음 기능선'];
        scenarios= [
          '시나리오 A (성공): 도지 하단 지지 → 종가 회복 → 상단 도전',
          '시나리오 B (실패): '+dl+' 종가 이탈 → 도지 외부 하방 전환 → 즉시 손절'
        ];
        supportCandidates   = ['도지 종가 '+dc+' (내부 균형)', '도지 하단 '+dl+' (매수세 경계)'];
        resistanceCandidates= ['도지 상단 '+du+' (매도세 경계)'];
        removedCandidates   = [{price:'장중 저가/고가', reason:'종가 기준이 아닌 흔적이므로 기능선에서 제외'}];
        finalJudge = '매수 가능 (도지 내부 분할 매수)';
      } else {
        posStr = '도지 내부 / 종가~상단 구간 (매도 우위)';
        recommendation = '도지 내부 매도 전략 (박스매매)';
        entries = ['1차 매도: '+du+' 근처 (도지 상단)', '2차 매도: '+dc+' 근처 (도지 종가)'];
        stopLoss = du+' 종가 돌파 시 실패 → 즉시 손절 (상방 전환)';
        targets  = ['1차 목표: '+dc+' (도지 종가)', '2차 목표: '+dl+' (도지 하단)'];
        scenarios= [
          '시나리오 A (성공): 도지 상단 저항 → 종가 이탈 → 하단 도전',
          '시나리오 B (실패): '+du+' 종가 돌파 → 도지 외부 상방 전환 → 즉시 손절'
        ];
        resistanceCandidates= ['도지 상단 '+du+' (매도세 경계)', '도지 종가 '+dc+' (내부 균형)'];
        supportCandidates   = ['도지 하단 '+dl+' (매수세 경계)'];
        removedCandidates   = [{price:'장중 저가/고가', reason:'종가 기준이 아닌 흔적이므로 기능선에서 제외'}];
        finalJudge = '매도 가능 (도지 내부 분할 매도)';
      }

    } else if(p > du){
      // 도지 외부 상방 — 추세매매
      posStr = '도지 상단 위 — 도지 외부 상방 (추세매매)';
      supportCandidates   = ['도지 상단 '+du+' (저항→지지 전환 후보)', '도지 종가 '+dc+' (2차 지지 후보)'];
      resistanceCandidates= [];
      removedCandidates   = [{price:'도지 하단 '+dl, reason:'상방 돌파 확정 시 하단은 1차 기능선에서 제외'}];
      if(bu) resistanceCandidates.push('박스 상단 '+bu+' (다음 저항)');

      if(d.retest==='pending'){
        recommendation = '상방 돌파 확인 — 눌림(리테스트) 대기 중';
        entries  = ['1차 매수 대기: '+du+' 지지 전환 확인 후', '2차 매수 대기: '+dc+' (도지 종가, 추가 조정 시)'];
        stopLoss = dc+' 종가 이탈 시 눌림 실패 → '+dl+' 이탈 시 완전 구조 붕괴';
        targets  = ['1차: 직전 고점 또는 다음 저항', '2차: 추세 가속 후 다음 기능선'];
        scenarios= [
          '시나리오 A: 눌림 발생 → '+du+' 지지 확인 → 재상승 → 추세 가속',
          '시나리오 B: '+dc+' 이탈 → 도지 내부 재진입 → 박스매매로 전환'
        ];
        finalJudge = '대기 (리테스트 발생 대기)';
      } else if(d.retest==='done'){
        recommendation = '리테스트 완료 — 도지 상단 지지 확인 후 매수';
        entries  = ['1차 매수: '+du+' 지지 확인 (리테스트 완료)', '2차 매수: '+dc+' (도지 종가, 추가 조정 시)'];
        stopLoss = dl+' 종가 이탈 시 완전 구조 붕괴 → 즉시 손절';
        targets  = ['1차: 직전 고점', '2차: 추세 가속 후 다음 저항'];
        scenarios= [
          '시나리오 A: 도지 상단 지지 확정 → 재상승 → 추세 가속',
          '시나리오 B: 추가 하락 → '+dc+' 이탈 → 손절'
        ];
        finalJudge = '매수 가능 (리테스트 성공 확인)';
      } else {
        recommendation = '리테스트 실패 — 구조 재평가 필요';
        entries  = ['새로운 기능선 재설정 후 재분석 필요'];
        stopLoss = dl+' 종가 이탈 시 완전 구조 붕괴';
        scenarios= ['시나리오 A: 현 가격에서 재지지 형성 후 재도전', '시나리오 B: 하락 지속 → 하위 기능선 확인'];
        targets  = [];
        finalJudge = '무포지션 (재평가 대기)';
      }

    } else {
      // 도지 외부 하방 — 추세매매
      posStr = '도지 하단 아래 — 도지 외부 하방 (추세매매)';
      resistanceCandidates= ['도지 하단 '+dl+' (지지→저항 전환 후보)', '도지 종가 '+dc+' (2차 저항 후보)'];
      supportCandidates   = [];
      removedCandidates   = [{price:'도지 상단 '+du, reason:'하방 이탈 확정 시 상단은 1차 기능선에서 제외'}];
      if(bl) supportCandidates.push('박스 하단 '+bl+' (다음 지지 후보)');

      if(d.retest==='pending'){
        recommendation = '하방 이탈 확인 — 반등(리테스트) 대기 중';
        entries  = ['1차 매도 대기: '+dl+' 저항 전환 확인 후', '2차 매도 대기: '+dc+' (도지 종가, 추가 반등 시)'];
        stopLoss = dc+' 종가 돌파 시 되돌림 실패 → '+du+' 돌파 시 완전 구조 붕괴';
        targets  = ['1차: 직전 저점 또는 다음 지지', '2차: 추세 하락 가속 후 다음 기능선'];
        scenarios= [
          '시나리오 A: 반등 발생 → '+dl+' 저항 확인 → 재하락 → 추세 가속',
          '시나리오 B: '+dc+' 돌파 → 도지 내부 재진입 → 박스매매로 전환'
        ];
        finalJudge = '대기 (반등 발생 대기)';
      } else if(d.retest==='done'){
        recommendation = '리테스트 완료 — 도지 하단 저항 확인 후 매도';
        entries  = ['1차 매도: '+dl+' 저항 확인 (리테스트 완료)', '2차 매도: '+dc+' (도지 종가, 추가 반등 시)'];
        stopLoss = du+' 종가 돌파 시 완전 구조 붕괴 → 즉시 손절';
        targets  = ['1차: 직전 저점', '2차: 추세 하락 가속'];
        scenarios= [
          '시나리오 A: 도지 하단 저항 확정 → 재하락 → 추세 가속',
          '시나리오 B: '+dc+' 돌파 → 손절'
        ];
        finalJudge = '매도 가능 (리테스트 성공 확인)';
      } else {
        recommendation = '리테스트 실패 — 구조 재평가 필요';
        entries  = ['새로운 기능선 재설정 후 재분석 필요'];
        stopLoss = du+' 종가 돌파 시 완전 구조 붕괴';
        scenarios= ['시나리오 A: 현 가격에서 재저항 형성', '시나리오 B: 반등 지속 → 상위 기능선 확인'];
        targets  = [];
        finalJudge = '무포지션 (재평가 대기)';
      }
    }

  // ══════════════════════════
  // ─ 박스 기반 전략 ─
  // ══════════════════════════
  } else if(hasBox){

    if(p >= bl && p <= bc){
      posStr = '박스 하단 ~ 종가 구간 (매수 우위)';
      recommendation = '박스 하단 매수 전략 (박스매매)';
      entries = ['1차 진입: '+bc+' 근처 (박스 종가 클러스터)', '2차 진입: '+bl+' 근처 (박스 하단)'];
      stopLoss = bl+' 종가 이탈 시 실패 → 즉시 손절';
      targets  = ['1차 목표: '+bu+' (박스 상단)', '2차 목표: 박스 상단 돌파 후 다음 기능선'];
      scenarios= [
        '시나리오 A (성공): 박스 하단 지지 → 종가 회복 → 상단 도전',
        '시나리오 B (실패): '+bl+' 종가 이탈 → 지지→저항 전환 → 즉시 손절 후 하방 추적'
      ];
      supportCandidates   = ['박스 종가 '+bc+' (균형점)', '박스 하단 '+bl+' (지지)'];
      resistanceCandidates= ['박스 상단 '+bu+' (저항)'];
      removedCandidates   = [{price:'박스 내 단순 스윙 저점', reason:'거래량 없는 단기 흔적. 핵심 전장 아님'}];
      finalJudge = '매수 가능 (박스 하단 분할 매수)';

    } else if(p > bc && p <= bu){
      posStr = '박스 종가 ~ 상단 구간 (매도 우위)';
      recommendation = '박스 상단 매도 전략 (박스매매)';
      entries = ['1차 매도: '+bu+' 근처 (박스 상단)', '2차 매도: '+bc+' 근처 (박스 종가)'];
      stopLoss = bu+' 종가 돌파 시 실패 → 즉시 손절 (지지전환)';
      targets  = ['1차 목표: '+bc+' (박스 종가)', '2차 목표: '+bl+' (박스 하단)'];
      scenarios= [
        '시나리오 A (성공): 박스 상단 저항 → 종가 이탈 → 하단 도전',
        '시나리오 B (실패): '+bu+' 종가 돌파 → 저항→지지 전환 → 즉시 손절 후 상방 추적'
      ];
      resistanceCandidates= ['박스 상단 '+bu+' (저항)', '박스 종가 '+bc+' (균형점)'];
      supportCandidates   = ['박스 하단 '+bl+' (지지)'];
      removedCandidates   = [{price:'박스 내 단순 스윙 고점', reason:'거래량 없는 단기 흔적. 핵심 전장 아님'}];
      finalJudge = '매도 가능 (박스 상단 분할 매도)';

    } else if(p > bu){
      posStr = '박스 상단 위 (상방 이탈)';
      recommendation = '눌림매매 대기 — 박스 상단이 지지로 전환되는지 확인';
      entries = ['1차 매수 대기: '+bu+' 지지 확인 (리테스트)', '2차 매수 대기: '+bc+' (박스 종가)'];
      stopLoss = bc+' 종가 이탈 시 눌림 실패 → 손절';
      targets  = ['1차: 이전 고점 또는 다음 저항', '2차: 추세 가속 후 다음 기능선'];
      scenarios= [
        '시나리오 A (눌림성공): '+bu+' 지지 확인 → 재상승 → 추세 가속',
        '시나리오 B (눌림실패): '+bc+' 이탈 → 박스 내부 복귀 → 박스매매로 전환'
      ];
      supportCandidates   = ['박스 상단 '+bu+' (저항→지지 전환 후보)', '박스 종가 '+bc+' (2차 지지)'];
      resistanceCandidates= [];
      removedCandidates   = [{price:'최근 고점 (단순 스윙)', reason:'거래량/체류시간 근거 없는 단순 고점'}];
      finalJudge = '대기 → 눌림목 확인 후 매수';

    } else {
      posStr = '박스 하단 아래 (하방 이탈)';
      recommendation = '되돌림 매도 대기 — 박스 하단이 저항으로 전환되는지 확인';
      entries = ['1차 매도 대기: '+bl+' 저항 확인 (리테스트)', '2차 매도 대기: '+bc+' (박스 종가)'];
      stopLoss = bc+' 종가 돌파 시 되돌림 실패 → 손절';
      targets  = ['1차: 이전 저점 또는 다음 지지', '2차: 추세 하락 가속'];
      scenarios= [
        '시나리오 A (매도성공): '+bl+' 저항 확인 → 재하락 → 추세 가속',
        '시나리오 B (매도실패): '+bc+' 돌파 → 박스 내부 복귀 → 박스매매로 전환'
      ];
      resistanceCandidates= ['박스 하단 '+bl+' (지지→저항 전환 후보)', '박스 종가 '+bc+' (2차 저항)'];
      supportCandidates   = [];
      removedCandidates   = [{price:'최근 저점 (단순 스윙)', reason:'거래량/체류시간 근거 없는 단순 저점'}];
      finalJudge = '대기 → 되돌림 확인 후 매도';
    }

  } else {
    posStr = '기능선 미특정';
    recommendation = '박스 경계 또는 도지 상단/종가/하단을 입력해 주세요.';
    finalJudge = '무포지션 (기능선 미특정)';
  }

  // 사건봉 기능선 추가
  if(ec){
    var ecStr = '사건봉 종가 '+ec+' (대량거래 합의가격)';
    if(p >= ec) supportCandidates.push(ecStr);
    else resistanceCandidates.push(ecStr);
  }

  // 도지 타입 텍스트
  var dojiTypeText = '';
  if(d.dojiType==='strength')  dojiTypeText = '추세강화도지 — 현 추세 중간 에너지 재충전. 재방문 시 강한 지지/저항';
  if(d.dojiType==='reversal')  dojiTypeText = '추세반전도지 — 추세 전환 기준점. 재침범 시 새 추세 자체가 훼손 신호';

  // 핵심 기능선 목록
  var fLines = [];
  if(du) fLines.push('도지 상단: '+du);
  if(dc) fLines.push('도지 종가: '+dc+' ← 압축된 합의가격');
  if(dl) fLines.push('도지 하단: '+dl);
  if(bu) fLines.push('박스 상단: '+bu);
  if(bc && hasBox) fLines.push('박스 종가 클러스터: '+bc);
  if(bl) fLines.push('박스 하단: '+bl);
  if(ec) fLines.push('사건봉 종가: '+ec+' ← 대량거래 후 합의');

  // ── 출력 HTML ──
  var color = finalJudge.includes('매수')?'#22c55e':finalJudge.includes('매도')?'#ef4444':'#f59e0b';
  var bgC   = finalJudge.includes('매수')?'rgba(34,197,94,.12)':finalJudge.includes('매도')?'rgba(239,68,68,.12)':'rgba(245,158,11,.12)';

  return '<div style="background:var(--s2);border-radius:12px;border:1px solid var(--bd);padding:20px;margin-top:12px">'
  +'<div style="font-size:15px;font-weight:800;margin-bottom:14px;color:var(--tx)">📊 차트술사 구조론 분석 결과</div>'
  +row('1. 현재 구조', (d.structure==='box'?'📦 박스 구간':d.structure==='trend-up'?'📈 상승 추세':'📉 하락 추세')+' &nbsp;|&nbsp; 기능선 격: <b>'+grade+'</b>')
  +row('2. 분석 관점', recommendation)
  +row('3. 현재 가격 위치', (p?p.toLocaleString()+'원':'미입력')+' — '+posStr)
  +section('4. 핵심 기능선', fLines.length ? fLines.map(function(l){return '• '+l;}).join('<br>') : '기능선 미입력')
  +(dojiTypeText ? row('4-1. 도지 타입', dojiTypeText) : '')
  +section('5. 핵심 지지 후보', supportCandidates.length ? supportCandidates.map(function(s,i){return '• '+(i===0?'1차: ':i===1?'2차: ':'보조: ')+s;}).join('<br>') : '해당 없음')
  +section('6. 핵심 저항 후보', resistanceCandidates.length ? resistanceCandidates.map(function(s,i){return '• '+(i===0?'1차: ':i===1?'2차: ':'보조: ')+s;}).join('<br>') : '해당 없음')
  +(removedCandidates.length ? section('7. 제거한 후보', removedCandidates.map(function(r){return '• <s>'+r.price+'</s> — '+r.reason;}).join('<br>')) : '')
  +(gapText ? section('8. 갭 해석', '• '+gapText+(gapWarn?'<br>• '+gapWarn:'')) : '')
  +section((gapText?'9':'8')+'. 거래량 해석', '• '+volText)
  +section((gapText?'10':'9')+'. 매매 시나리오', scenarios.map(function(s){return '• '+s;}).join('<br>'))
  +section((gapText?'11':'10')+'. 진입 전략', entries.map(function(e){return '• '+e;}).join('<br>'))
  +row((gapText?'12':'11')+'. 손절 기준', '⛔ '+stopLoss)
  +(targets.length ? section((gapText?'13':'12')+'. 익절 기준', targets.map(function(t){return '• '+t;}).join('<br>')) : '')
  +(d.note ? row('참고', d.note) : '')
  +'<div style="margin-top:16px;padding:14px;border-radius:8px;background:'+bgC+';border:1.5px solid '+color+';font-size:14px;font-weight:700;color:'+color+'">'
  +'🏁 최종 판단: '+finalJudge+'</div>'
  +'<div style="margin-top:8px;font-size:10px;color:#4b5563">⚠ 차트술사 구조론 규칙 기반 시나리오입니다. 투자 결정은 반드시 본인이 최종 판단하세요.</div>'
  +'</div>';
}

// ── 출력 헬퍼 ──
function row(label, value){
  return '<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
  +'<div style="min-width:130px;font-size:11px;color:#6b7280;font-weight:600;flex-shrink:0">'+label+'</div>'
  +'<div style="font-size:12px;color:var(--tx);line-height:1.6">'+value+'</div></div>';
}
function section(label, content){
  return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
  +'<div style="font-size:11px;color:#6b7280;font-weight:600;margin-bottom:4px">'+label+'</div>'
  +'<div style="font-size:12px;color:var(--tx);line-height:1.75">'+content+'</div></div>';
}

// ═══════════════════════
// ── 빌더 함수들 ──
// ═══════════════════════

function buildCSS(){
  return '<style>'
  +'.ct-hero{text-align:center;padding:16px 16px 12px;border-bottom:1px solid var(--bd)}'
  +'.ct-hero h2{font-size:18px;font-weight:800;margin-bottom:4px}'
  +'.ct-tab-bar{display:flex;gap:8px;padding:10px 16px;background:var(--s1);border-bottom:1px solid var(--bd);overflow-x:auto;scrollbar-width:none}'
  +'.ct-tab-bar::-webkit-scrollbar{display:none}'
  +'.ct-tab{padding:8px 14px;border-radius:20px;border:1px solid var(--bd);background:transparent;color:var(--mt);cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;transition:all .2s}'
  +'.ct-tab.on{background:var(--ac);color:#fff;border-color:var(--ac)}'
  +'.ct-pane{padding:16px}'
  +'.ct-form-row{margin-bottom:10px}'
  +'.ct-label{font-size:11px;font-weight:700;color:var(--mt);margin-bottom:4px}'
  +'.ct-input{width:100%;padding:9px 12px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-size:13px;box-sizing:border-box}'
  +'.ct-input:focus{outline:none;border-color:var(--ac)}'
  +'.ct-input-group{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
  +'.ct-input-group3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}'
  +'.ct-btn{padding:12px 20px;background:var(--ac);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;width:100%;margin-top:8px}'
  +'.ct-btn:hover{opacity:.9}'
  +'.ct-box{background:var(--s2);border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid var(--bd)}'
  +'.ct-box-title{font-size:12px;font-weight:700;color:var(--tx);margin-bottom:10px}'
  +'.ct-card{background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:14px;margin-bottom:12px}'
  +'.ct-card-title{font-size:13px;font-weight:700;color:var(--tx);margin-bottom:8px}'
  +'.ct-card-body{font-size:12px;color:var(--mt);line-height:1.75}'
  +'.ct-theory-step{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}'
  +'.ct-step-num{min-width:26px;height:26px;border-radius:50%;background:var(--ac);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
  +'.ct-step-content{font-size:12px;color:var(--mt)}'
  +'.ct-step-title{font-weight:700;color:var(--tx);font-size:12px;margin-bottom:2px}'
  +'.ct-sym-bar{display:flex;gap:8px;margin-bottom:12px}'
  +'.ct-sym-input{flex:1;padding:9px 12px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-size:13px}'
  +'.ct-sym-btn{padding:9px 16px;background:var(--ac);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600}'
  +'@media(max-width:640px){.ct-input-group{grid-template-columns:1fr}.ct-input-group3{grid-template-columns:1fr 1fr}}'
  +'</style>';
}

function buildHero(){
  return '<div class="ct-hero">'
  +'<h2>🔍 차트술사 구조론 분석 도구</h2>'
  +'<p style="color:var(--mt);font-size:11px">체결→거래량→종가→사건봉→박스→도지→기능선→지지저항전환→매매시나리오</p>'
  +'</div>';
}

function buildTabBar(){
  var tabs = [{id:'chart',label:'📈 TradingView 차트'},{id:'analyze',label:'🔍 구조론 분석'},{id:'theory',label:'📚 이론 가이드'}];
  return '<div class="ct-tab-bar">'
  + tabs.map(function(t){
    return '<button class="ct-tab" data-t="'+t.id+'" onclick="window._ctSwitchTab(\''+t.id+'\')">'+t.label+'</button>';
  }).join('')+'</div>';
}

function buildTabContent(){
  return buildChartPane() + buildAnalyzePane() + buildTheoryPane();
}

// ── 차트 탭 ──
function buildChartPane(){
  return '<div class="ct-pane" data-pane="chart" style="display:none">'
  +'<div class="ct-sym-bar">'
  +'<input id="ct-sym-input" class="ct-sym-input" placeholder="종목코드 입력 (예: 005930, AAPL)" value="'+_ctSymbol+'" onkeydown="if(event.key===\'Enter\')window._ctChangeSymbol()">'
  +'<select id="ct-int-select" class="ct-sym-input" style="max-width:100px">'
  +'<option value="5">5분</option><option value="15">15분</option><option value="60">1시간</option>'
  +'<option value="D" selected>일봉</option><option value="W">주봉</option><option value="M">월봉</option>'
  +'</select>'
  +'<button class="ct-sym-btn" onclick="window._ctChangeSymbol()">조회</button>'
  +'</div>'
  +'<div id="ct-tv-box" style="height:580px;border-radius:10px;overflow:hidden;border:1px solid var(--bd)"></div>'
  +'<div style="margin-top:10px;font-size:11px;color:#4b5563;text-align:center">TradingView 차트 — 심볼 입력 후 Enter 또는 조회 | 예: 005930, AAPL, BTCUSDT</div>'
  +'</div>';
}

// ── 분석 탭 ──
function buildAnalyzePane(){
  return '<div class="ct-pane" data-pane="analyze" style="display:none">'
  +'<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:#f59e0b">'
  +'💡 차트에서 박스 경계·도지 상단/하단/종가·사건봉 종가를 읽어 입력하면 구조론 기반 분석이 생성됩니다.'
  +'</div>'

  // 기본 정보
  +'<div class="ct-box"><div class="ct-box-title">📋 기본 정보</div>'
  +'<div class="ct-input-group">'
  +'<div class="ct-form-row"><div class="ct-label">현재 구조 *</div>'
  +'<select id="ct-structure" class="ct-input">'
  +'<option value="box">📦 박스 구간 (횡보)</option>'
  +'<option value="trend-up">📈 상승 추세</option>'
  +'<option value="trend-down">📉 하락 추세</option>'
  +'</select></div>'
  +'<div class="ct-form-row"><div class="ct-label">기능선 프레임 (格)</div>'
  +'<select id="ct-frame" class="ct-input">'
  +'<option value="daily" selected>B급 — 일봉</option>'
  +'<option value="weekly">A급 — 주봉</option>'
  +'<option value="monthly">S급 — 월봉</option>'
  +'<option value="h4">C급 — 4시간</option>'
  +'<option value="h1">C급 — 1시간</option>'
  +'</select></div>'
  +'</div>'
  +'<div class="ct-form-row"><div class="ct-label">현재 가격 *</div>'
  +'<input id="ct-price" class="ct-input" type="number" placeholder="현재 가격 (예: 75000)"></div>'
  +'</div>'

  // 박스 경계
  +'<div class="ct-box"><div class="ct-box-title">📦 박스 경계</div>'
  +'<div class="ct-input-group3">'
  +'<div class="ct-form-row"><div class="ct-label">박스 상단 (저항)</div><input id="ct-box-upper" class="ct-input" type="number" placeholder="박스 상단"></div>'
  +'<div class="ct-form-row"><div class="ct-label">종가 클러스터 (균형)</div><input id="ct-box-close" class="ct-input" type="number" placeholder="생략 시 중간값 자동"></div>'
  +'<div class="ct-form-row"><div class="ct-label">박스 하단 (지지)</div><input id="ct-box-lower" class="ct-input" type="number" placeholder="박스 하단"></div>'
  +'</div></div>'

  // 도지 경계 (신규)
  +'<div class="ct-box"><div class="ct-box-title">🕯 도지 경계 (내부/외부 시점 적용)</div>'
  +'<div class="ct-input-group3">'
  +'<div class="ct-form-row"><div class="ct-label">도지 상단</div><input id="ct-doji-upper" class="ct-input" type="number" placeholder="도지 상단"></div>'
  +'<div class="ct-form-row"><div class="ct-label">도지 종가 (합의가격)</div><input id="ct-doji-close" class="ct-input" type="number" placeholder="도지 종가"></div>'
  +'<div class="ct-form-row"><div class="ct-label">도지 하단</div><input id="ct-doji-lower" class="ct-input" type="number" placeholder="도지 하단"></div>'
  +'</div>'
  +'<div class="ct-form-row"><div class="ct-label">도지 타입</div>'
  +'<select id="ct-doji-type" class="ct-input">'
  +'<option value="none">없음 / 미분류</option>'
  +'<option value="strength">추세강화도지 (추세 중간 에너지 재충전)</option>'
  +'<option value="reversal">추세반전도지 (추세 전환 기준점)</option>'
  +'</select></div>'
  +'</div>'

  // 사건봉
  +'<div class="ct-box"><div class="ct-box-title">⚡ 사건봉 & 컨텍스트</div>'
  +'<div class="ct-form-row"><div class="ct-label">사건봉 종가 (고거래량 봉)</div>'
  +'<input id="ct-event-close" class="ct-input" type="number" placeholder="주변 대비 거래량이 비정상적으로 컸던 봉의 종가"></div>'
  +'<div class="ct-input-group">'
  +'<div class="ct-form-row"><div class="ct-label">거래량 수준</div>'
  +'<select id="ct-vol" class="ct-input">'
  +'<option value="high">📈 급증 (평균 2배+)</option>'
  +'<option value="normal" selected>📊 보통</option>'
  +'<option value="low">📉 감소</option>'
  +'</select></div>'
  +'<div class="ct-form-row"><div class="ct-label">현재 가격 동작</div>'
  +'<select id="ct-vol-context" class="ct-input">'
  +'<option value="none" selected>일반 (컨텍스트 없음)</option>'
  +'<option value="breakout">🔼 돌파 중</option>'
  +'<option value="pullback">🔽 눌림(조정) 중</option>'
  +'<option value="breakdown">⬇ 이탈(하락돌파) 중</option>'
  +'<option value="bounce">⬆ 반등 중</option>'
  +'</select></div>'
  +'</div></div>'

  // 갭 & 리테스트 (신규)
  +'<div class="ct-box"><div class="ct-box-title">🔲 갭 & 리테스트</div>'
  +'<div class="ct-input-group">'
  +'<div class="ct-form-row"><div class="ct-label">갭 상황</div>'
  +'<select id="ct-gap" class="ct-input">'
  +'<option value="none" selected>갭 없음</option>'
  +'<option value="up-above">⬆ 상승갭 (핵심저항 위)</option>'
  +'<option value="up-below">↗ 상승갭 (핵심저항 아래)</option>'
  +'<option value="down-below">⬇ 하락갭 (핵심지지 아래)</option>'
  +'<option value="down-above">↘ 하락갭 (핵심지지 위)</option>'
  +'</select></div>'
  +'<div class="ct-form-row"><div class="ct-label">리테스트(되돌림) 상태</div>'
  +'<select id="ct-retest" class="ct-input">'
  +'<option value="pending" selected>아직 대기 중</option>'
  +'<option value="done">완료 — 지지/저항 확인됨</option>'
  +'<option value="failed">실패 — 돌파/이탈됨</option>'
  +'</select></div>'
  +'</div></div>'

  +'<div class="ct-form-row"><div class="ct-label">기타 참고 사항</div>'
  +'<textarea id="ct-note" class="ct-input" rows="2" placeholder="뉴스, 특이사항, 이벤트 등"></textarea></div>'
  +'<button class="ct-btn" onclick="window._ctAnalyze()">🔍 차트술사 구조론으로 분석</button>'
  +'<div id="ct-output"></div>'
  +'</div>';
}

// ── 이론 가이드 탭 ──
function buildTheoryPane(){
  var steps = [
    {num:1,title:'체결',desc:'시장의 실제 행동 — 누군가 사고 누군가 판다. 체결이 쌓여 거래량이 된다.'},
    {num:2,title:'거래량',desc:'자금이 지나간 흔적. 사건봉 = 주변 대비 비정상적으로 큰 거래량. 돌파+급증=신뢰, 눌림+감소=진입, 이탈+급증=신뢰, 반등+감소=매도.'},
    {num:3,title:'종가',desc:'시장의 최종 합의 가격. 장중 고/저가는 흔적. 모든 돌파·이탈 판단은 종가 기준.'},
    {num:4,title:'사건봉 종가',desc:'대량거래 봉 종가 = 시장이 미래에 다시 참조하는 가격. 상승봉 종가=지지후보, 하락봉 종가=저항후보. 꼬리 끝이 아닌 종가가 핵심.'},
    {num:5,title:'박스',desc:'매수·매도가 균형을 이루는 합의구간. 상단=저항, 하단=지지. 박스 안=박스매매, 박스 밖=추세매매.'},
    {num:6,title:'도지',desc:'압축된 박스. 하위 프레임 횡보 → 상위 프레임 도지. 도지 상단/종가/하단으로 내부·외부 시점 분리.'},
    {num:7,title:'기능선',desc:'실제로 지지·저항 기능을 수행한 가격. 반복 수행할수록 格이 높아진다. 格: S(월)>A(주)>B(일)>C(4H/1H).'},
    {num:8,title:'지지·저항 전환',desc:'저항 종가 돌파 → 지지로 전환. 지지 종가 이탈 → 저항으로 전환. 스위치 원리. 리테스트로 전환 확인.'},
    {num:9,title:'박스매매 / 추세매매',desc:'박스 안: 하단매수·상단매도. 박스 밖 상방: 눌림매매. 박스 밖 하방: 되돌림매도.'},
    {num:10,title:'진입·손절·익절',desc:'진입 근거 상실 시 즉시 손절. 익절=다음 기능선 도달. 고정비율 금지. 새 이유 붙이기 금지.'}
  ];

  var dojiTypes = [
    {name:'추세강화도지',desc:'기존 추세 중간에 도지 형성 → 이후 같은 방향으로 추세 지속. 상승추세강화도지 = 조정 시 지지후보. 하락추세강화도지 = 반등 시 저항후보.'},
    {name:'추세반전도지',desc:'기존 추세 이후 도지 형성 → 이후 반대 방향으로 추세 전환. 단순 지지/저항이 아닌 추세 전환 기준점. 재침범 시 새 추세 자체가 훼손 신호.'}
  ];

  var grades = [
    {grade:'S급',frame:'월봉',desc:'월봉 도지, 월봉 사건봉, 월봉 대형 박스'},
    {grade:'A급',frame:'주봉',desc:'주봉 도지, 주봉 사건봉, 주봉 대형 박스'},
    {grade:'B급',frame:'일봉',desc:'일봉 도지, 일봉 사건봉, 일봉 박스'},
    {grade:'C급',frame:'단기',desc:'4시간·1시간 — 참고용, 상위 프레임 우선'}
  ];

  var strengths = [
    '1순위: 거래량 — 클수록 더 많은 자금이 합의한 가격',
    '2순위: 체류시간 — 오래 머문 구간일수록 강하다',
    '3순위: 돌파 이후 이동거리 — 이후 추세가 클수록 원래 박스 중요도 상승',
    '4순위: 반복 기능 — 지지·저항을 반복 수행할수록 강하다',
    '5순위: 프레임 — 동일 조건이면 월봉 > 주봉 > 일봉 순서로 우선'
  ];

  var removals = [
    '단순 스윙 저점 / 단순 스윙 고점',
    '거래량 없는 조정 저점 / 반등 고점',
    '추세 진행 중 형성된 작은 눌림',
    '현재가와 가깝다는 이유만으로 선택한 가격',
    '이동평균선·피보나치·라운드넘버만 근거로 선택한 가격',
    '돌파 후 강한 이동을 만들지 못한 도지',
    '최근 저점·고점이라는 이유만으로 선택한 가격',
    '짧은 꼬리 하나만 보고 선택한 가격'
  ];

  var gapCases = [
    {situation:'상승갭 — 핵심저항 위', result:'저항을 거래 없이 돌파 → 지지 전환 가능성 → 눌림(리테스트) 대기'},
    {situation:'상승갭 — 핵심저항 아래', result:'저항 미돌파 → 기존 저항 유지 → 관찰'},
    {situation:'하락갭 — 핵심지지 아래', result:'지지를 거래 없이 이탈 → 저항 전환 가능성 → 반등 매도 대기'},
    {situation:'하락갭 — 핵심지지 위', result:'지지 미이탈 → 기존 지지 유지 → 관찰'}
  ];

  var rules = [
    '종가 기준이 아닌 장중 돌파만으로 판단하지 않는다.',
    '도지를 단순 캔들 패턴으로만 해석하지 않는다.',
    '박스와 추세를 구분하지 않고 분석하지 않는다.',
    '사건봉의 꼬리 끝만 보고 핵심 가격을 정하지 않는다.',
    '거래량 없는 돌파를 신뢰도 높게 평가하지 않는다.',
    '기능선이 사라졌는데도 새 이유를 붙여 보유하지 않는다.',
    '갭 자체만 보고 의미를 부여하지 않는다.',
    '손절 기준 없이 상승/하락 가능성만 말하지 않는다.',
    '현재가와 가깝다는 이유만으로 지지·저항을 선택하지 않는다.',
    '단순 스윙저점과 스윙고점을 핵심 전장으로 착각하지 않는다.'
  ];

  return '<div class="ct-pane" data-pane="theory" style="display:none">'

  // 핵심 흐름
  +'<div class="ct-card"><div class="ct-card-title">📊 차트술사 구조론 핵심 흐름</div>'
  + steps.map(function(s){
    return '<div class="ct-theory-step"><div class="ct-step-num">'+s.num+'</div>'
    +'<div class="ct-step-content"><div class="ct-step-title">'+s.title+'</div>'+s.desc+'</div></div>';
  }).join('') +'</div>'

  // 도지 종류
  +'<div class="ct-card"><div class="ct-card-title">🕯 도지의 종류</div><div class="ct-card-body">'
  + dojiTypes.map(function(t){
    return '<div style="margin-bottom:10px"><strong style="color:var(--tx)">'+t.name+'</strong><br>'+t.desc+'</div>';
  }).join('')+'</div></div>'

  // 기능선 격 체계
  +'<div class="ct-card"><div class="ct-card-title">🏆 기능선 格 체계 (월봉 > 주봉 > 일봉)</div><div class="ct-card-body">'
  + grades.map(function(g){
    var col = g.grade==='S급'?'#f59e0b':g.grade==='A급'?'#c084fc':g.grade==='B급'?'#60a5fa':'#6b7280';
    return '<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
    +'<div style="min-width:40px;font-weight:700;color:'+col+'">'+g.grade+'</div>'
    +'<div><span style="color:var(--tx);font-weight:600">'+g.frame+'</span> — '+g.desc+'</div></div>';
  }).join('')+'</div></div>'

  // 전장 강도 평가
  +'<div class="ct-card"><div class="ct-card-title">⚡ 전장 강도 평가 (5순위)</div><div class="ct-card-body">'
  + strengths.map(function(s){ return '• '+s+'<br>'; }).join('')+'</div></div>'

  // 후보 제거 규칙
  +'<div class="ct-card"><div class="ct-card-title">🗑 후보 제거 규칙 — 이것들은 핵심 기능선이 아니다</div><div class="ct-card-body">'
  + removals.map(function(r){ return '• <s>'+r+'</s><br>'; }).join('')+'</div></div>'

  // 갭 해석 4케이스
  +'<div class="ct-card"><div class="ct-card-title">🔲 갭 해석 4케이스</div><div class="ct-card-body">'
  + gapCases.map(function(g){
    return '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
    +'<div style="color:var(--tx);font-weight:600">'+g.situation+'</div>'
    +'<div>→ '+g.result+'</div></div>';
  }).join('')+'</div></div>'

  // 핵심 공식
  +'<div class="ct-card"><div class="ct-card-title">🎯 핵심 공식 요약</div><div class="ct-card-body">'
  +'<strong style="color:var(--tx)">박스 안</strong> → 박스매매 (하단 매수·상단 매도)<br>'
  +'<strong style="color:var(--tx)">박스 밖 (상방)</strong> → 눌림매매 (저항→지지 전환 리테스트 확인)<br>'
  +'<strong style="color:var(--tx)">박스 밖 (하방)</strong> → 되돌림 매도 (지지→저항 전환 리테스트 확인)<br>'
  +'<strong style="color:var(--tx)">근거 상실</strong> → 즉시 손절. 새 이유 금지<br><br>'
  +'<strong style="color:#f59e0b">도지 내부시점</strong> = 박스매매<br>'
  +'• 하단~종가: 매수 우위 | 손절 = 도지 하단 종가 이탈<br>'
  +'• 종가~상단: 매도 우위 | 손절 = 도지 상단 종가 돌파<br><br>'
  +'<strong style="color:#22c55e">도지 외부 상방</strong> = 눌림매매<br>'
  +'• 1차 매수: 도지 상단 지지 | 2차: 도지 종가 | 손절: 도지 하단 이탈<br><br>'
  +'<strong style="color:#ef4444">도지 외부 하방</strong> = 되돌림 매도<br>'
  +'• 1차 매도: 도지 하단 저항 | 2차: 도지 종가 | 손절: 도지 상단 돌파<br><br>'
  +'<strong style="color:#06b6d4">공포에 매수</strong> = 저항 돌파한 종목의 되돌림 공포에 매수<br>'
  +'<strong style="color:#a855f7">안도에 매도</strong> = 지지 이탈한 종목의 반등 안도감에 매도'
  +'</div></div>'

  // 절대 금지
  +'<div class="ct-card"><div class="ct-card-title">⛔ 절대 금지 규칙</div><div class="ct-card-body">'
  + rules.map(function(r){ return '• '+r+'<br>'; }).join('')+'</div></div>'

  +'<div style="font-size:11px;color:#4b5563;text-align:center;padding-bottom:8px">'
  +'차트술사 구조론 — 차트는 미래 예언이 아닌 시장 참여자들의 합의 역사책이다'
  +'</div></div>';
}

})();
