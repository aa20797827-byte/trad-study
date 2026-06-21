// ═══ 차트술사 구조론 분석 도구 ═══
// 체결→거래량→종가→사건봉→박스→도지→기능선→지지저항전환→매매시나리오

(function(){

var _ctTab = 'chart';
var _ctSymbol = 'KRX:005930';
var _ctInterval = 'D';
var _tvLoaded = false;

// ── 메인 진입 함수 ──
window.showChart = function(){
  var wrap = document.getElementById('chartwrap');
  if(!wrap) return;
  wrap.innerHTML = buildCSS() + buildHero() + buildTabBar() + buildTabContent();
  window._ctSwitchTab(_ctTab);
};

// ── 탭 전환 ──
window._ctSwitchTab = function(id){
  _ctTab = id;
  document.querySelectorAll('.ct-tab').forEach(function(b){ b.classList.toggle('on', b.dataset.t===id); });
  var contents = document.querySelectorAll('.ct-pane');
  contents.forEach(function(c){ c.style.display = c.dataset.pane===id ? 'block' : 'none'; });
  if(id==='chart' && !_tvLoaded) { setTimeout(initTV, 250); _tvLoaded=true; }
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
    autosize: true, symbol: _ctSymbol, interval: _ctInterval,
    timezone: 'Asia/Seoul', theme: isDark?'dark':'light',
    style: '1', locale: 'kr', withdateranges: true,
    hide_side_toolbar: false, allow_symbol_change: true,
    details: true, support_host: 'https://www.tradingview.com'
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
  setTimeout(function(){ initTV(); _tvLoaded = true; }, 50);
};

// ── 구조론 분석 엔진 ──
window._ctAnalyze = function(){
  var f = function(id){ return parseFloat(document.getElementById(id).value)||0; };
  var s = function(id){ return document.getElementById(id).value; };

  var data = {
    structure: s('ct-structure'),    // box/trend-up/trend-down
    currentPrice: f('ct-price'),
    boxUpper: f('ct-box-upper'),
    boxClose: f('ct-box-close'),
    boxLower: f('ct-box-lower'),
    dojiClose: f('ct-doji-close'),
    eventClose: f('ct-event-close'),
    tvol: s('ct-vol'),               // high/low/normal
    note: s('ct-note')
  };

  var result = generateAnalysis(data);
  document.getElementById('ct-output').innerHTML = result;
  document.getElementById('ct-output').scrollIntoView({behavior:'smooth', block:'start'});
};

function generateAnalysis(d){
  var p = d.currentPrice;
  var bu = d.boxUpper, bc = d.boxClose, bl = d.boxLower;
  var dc = d.dojiClose, ec = d.eventClose;

  // 위치 판정
  var posStr = '';
  var recommendation = '';
  var scenarios = [];
  var entries = [];
  var stopLoss = '';
  var targets = [];
  var finalJudge = '';

  if(d.structure === 'box'){
    // 박스 내부 — 박스매매
    if(p >= bl && p <= bc){
      posStr = '박스 하단 ~ 종가 구간 (매수 우위)';
      recommendation = '박스 하단 매수 전략 적용';
      entries = [
        '1차 진입: ' + bc + ' 근처 (박스 종가 클러스터)',
        '2차 진입: ' + bl + ' 근처 (박스 하단)'
      ];
      stopLoss = bl + ' 종가 이탈 시 실패 인정';
      targets = [
        '1차 목표: ' + bu + ' (박스 상단)',
        '2차 목표: 박스 상단 종가 돌파 후 다음 기능선'
      ];
      scenarios = [
        '시나리오 A (성공): 가격이 박스 하단 지지 → 박스 종가 회복 → 박스 상단 도전',
        '시나리오 B (실패): ' + bl + ' 종가 이탈 → 지지가 저항으로 전환 → 즉시 손절 후 하방 추적'
      ];
      finalJudge = '매수 가능 (박스 하단 분할 매수)';
    } else if(p > bc && p <= bu){
      posStr = '박스 종가 ~ 상단 구간 (매도 우위)';
      recommendation = '박스 상단 매도 전략 적용';
      entries = [
        '1차 매도: ' + bu + ' 근처 (박스 상단)',
        '2차 매도: ' + bc + ' 근처 (박스 종가)'
      ];
      stopLoss = bu + ' 종가 돌파 시 실패 인정 (지지전환 가능성)';
      targets = [
        '1차 목표: ' + bc + ' (박스 종가)',
        '2차 목표: ' + bl + ' (박스 하단)'
      ];
      scenarios = [
        '시나리오 A (성공): 박스 상단 저항 → 박스 종가 이탈 → 박스 하단 도전',
        '시나리오 B (실패): ' + bu + ' 종가 돌파 → 저항이 지지로 전환 → 즉시 손절 후 상방 추적'
      ];
      finalJudge = '매도 가능 (박스 상단 분할 매도)';
    } else if(p > bu){
      posStr = '박스 상단 위 (상방 이탈)';
      recommendation = '눌림매매 대기 — 박스 상단이 지지로 전환되는지 확인';
      entries = [
        '1차 매수: ' + bu + ' 지지 확인 후 (박스 상단 리테스트)',
        '2차 매수: ' + bc + ' (박스 종가, 2차 타점)'
      ];
      stopLoss = bc + ' 종가 이탈 시 실패 (눌림 실패)';
      targets = [
        '1차 목표: 이전 고점 또는 다음 기능선',
        '2차 목표: 추세 가속 후 다음 저항'
      ];
      scenarios = [
        '시나리오 A (눌림성공): ' + bu + ' 지지 → 재상승 → 추세 가속',
        '시나리오 B (눌림실패): ' + bc + ' 이탈 → 박스 내부 복귀 → 박스매매로 전환'
      ];
      finalJudge = '대기 → 눌림목 확인 후 매수';
    } else {
      posStr = '박스 하단 아래 (하방 이탈)';
      recommendation = '되돌림 매도 대기 — 박스 하단이 저항으로 전환되는지 확인';
      entries = [
        '1차 매도: ' + bl + ' 저항 확인 후 (박스 하단 리테스트)',
        '2차 매도: ' + bc + ' (박스 종가, 2차 타점)'
      ];
      stopLoss = bc + ' 종가 돌파 시 실패 (되돌림 실패)';
      targets = [
        '1차 목표: 이전 저점 또는 다음 기능선',
        '2차 목표: 추세 하락 가속 후 다음 지지'
      ];
      scenarios = [
        '시나리오 A (매도성공): ' + bl + ' 저항 → 재하락 → 추세 가속',
        '시나리오 B (매도실패): ' + bc + ' 돌파 → 박스 내부 복귀 → 박스매매로 전환'
      ];
      finalJudge = '대기 → 되돌림 확인 후 매도';
    }
  } else if(d.structure === 'trend-up'){
    posStr = '상승 추세 구간';
    if(p >= (dc||ec||bl) && (ec||dc)){
      recommendation = '상승 추세 눌림매매 — 사건봉/도지 종가 지지 확인';
      entries = [
        '1차 매수: ' + (ec||dc) + ' (사건봉/도지 종가 지지)',
        '2차 매수: 추가 조정 시 분할 매수'
      ];
      stopLoss = (ec||dc) + ' 종가 이탈 시 상승 논리 상실 → 손절';
      targets = ['1차 목표: 직전 고점', '2차 목표: 추세 가속'];
      scenarios = [
        '시나리오 A: 사건봉/도지 종가 지지 확인 → 추세 재개',
        '시나리오 B: 지지 이탈 → 상승 구조 붕괴 → 손절 후 재평가'
      ];
      finalJudge = '매수 가능 (눌림 확인 후)';
    } else {
      recommendation = '상승 추세 중 — 진입 타점 대기';
      entries = ['되돌림 발생 시 기능선 지지 확인 후 진입'];
      stopLoss = '핵심 기능선 종가 이탈';
      targets = ['다음 저항 기능선'];
      scenarios = [
        '시나리오 A: 조정 후 지지 확인 → 추세 재개 진입',
        '시나리오 B: 조정 심화 → 구조 붕괴 → 재평가'
      ];
      finalJudge = '대기 (눌림 발생 대기)';
    }
  } else {
    posStr = '하락 추세 구간';
    recommendation = '하락 추세 되돌림 매도 — 사건봉/도지 종가 저항 확인';
    entries = [
      '1차 매도: ' + (ec||dc||bu) + ' (사건봉/도지 종가 저항)',
      '2차 매도: 추가 반등 시 분할 매도'
    ];
    stopLoss = (ec||dc||bu) + ' 종가 돌파 시 하락 논리 상실 → 손절';
    targets = ['1차 목표: 직전 저점', '2차 목표: 추세 하락 가속'];
    scenarios = [
      '시나리오 A: 저항 확인 → 추세 재개 (재하락)',
      '시나리오 B: 저항 돌파 → 하락 구조 붕괴 → 손절 후 재평가'
    ];
    finalJudge = '매도 가능 (되돌림 확인 후)';
  }

  // 기능선 정보
  var fLines = [];
  if(bu) fLines.push('저항선: '+bu);
  if(bc) fLines.push('박스 종가(균형점): '+bc);
  if(bl) fLines.push('지지선: '+bl);
  if(dc) fLines.push('도지 종가: '+dc);
  if(ec) fLines.push('사건봉 종가: '+ec);

  // 거래량 해석
  var volText = d.tvol==='high'?'거래량 급증 — 수급 유입/이탈 확인 필요':
                d.tvol==='low'?'거래량 감소 — 매도/매수 압력 약화':
                '거래량 보통 — 추세 확인 필요';

  // HTML 출력
  return '<div style="background:var(--s2);border-radius:12px;border:1px solid var(--bd);padding:20px;margin-top:12px">'
  +'<div style="font-size:16px;font-weight:800;margin-bottom:16px;color:var(--tx)">📊 차트술사 구조론 분석 결과</div>'
  +row('1. 현재 구조', d.structure==='box'?'📦 박스 구간 (박스매매 적용)':d.structure==='trend-up'?'📈 상승 추세 구간 (추세매매)':'📉 하락 추세 구간 (추세매매)')
  +row('2. 분석 관점', recommendation)
  +row('3. 현재 가격 위치', p ? p+'원 — '+posStr : '가격 미입력')
  +section('4. 핵심 기능선', fLines.map(function(l){return '• '+l;}).join('<br>') || '기능선 미입력')
  +section('5. 거래량 해석', '• '+volText)
  +section('6. 매매 시나리오', scenarios.map(function(s){return '• '+s;}).join('<br>'))
  +section('7. 진입 전략', entries.map(function(e){return '• '+e;}).join('<br>'))
  +row('8. 손절 기준', '⛔ '+stopLoss)
  +section('9. 익절 기준', targets.map(function(t){return '• '+t;}).join('<br>'))
  +(d.note ? row('10. 참고 사항', d.note) : '')
  +'<div style="margin-top:16px;padding:14px;border-radius:8px;background:'
  +(finalJudge.includes('매수')?'rgba(34,197,94,.12)':finalJudge.includes('매도')?'rgba(239,68,68,.12)':'rgba(245,158,11,.12)')
  +';border:1.5px solid '+(finalJudge.includes('매수')?'#22c55e':finalJudge.includes('매도')?'#ef4444':'#f59e0b')
  +';font-size:14px;font-weight:700;color:'+(finalJudge.includes('매수')?'#22c55e':finalJudge.includes('매도')?'#ef4444':'#f59e0b')+'">'
  +'🏁 최종 판단: '+finalJudge+'</div>'
  +'<div style="margin-top:10px;font-size:10px;color:#4b5563">⚠ 이 분석은 차트술사 구조론의 규칙을 적용한 시나리오입니다. 투자 결정은 반드시 본인이 최종 판단하세요.</div>'
  +'</div>';
}

function row(label, value){
  return '<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
  +'<div style="min-width:120px;font-size:11px;color:#6b7280;font-weight:600">'+label+'</div>'
  +'<div style="font-size:12px;color:var(--tx)">'+value+'</div></div>';
}
function section(label, content){
  return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
  +'<div style="font-size:11px;color:#6b7280;font-weight:600;margin-bottom:4px">'+label+'</div>'
  +'<div style="font-size:12px;color:var(--tx);line-height:1.7">'+content+'</div></div>';
}

// ── CSS ──
function buildCSS(){
  return '<style>'
  +'.ct-hero{text-align:center;padding:16px 16px 12px;border-bottom:1px solid var(--bd)}'
  +'.ct-hero h2{font-size:18px;font-weight:800;margin-bottom:4px}'
  +'.ct-tab-bar{display:flex;gap:8px;padding:10px 16px;background:var(--s1);border-bottom:1px solid var(--bd);overflow-x:auto;scrollbar-width:none}'
  +'.ct-tab-bar::-webkit-scrollbar{display:none}'
  +'.ct-tab{padding:8px 14px;border-radius:20px;border:1px solid var(--bd);background:transparent;color:var(--mt);cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;transition:all .2s}'
  +'.ct-tab.on{background:var(--ac);color:#fff;border-color:var(--ac)}'
  +'.ct-pane{padding:16px}'
  +'.ct-form-row{margin-bottom:12px}'
  +'.ct-label{font-size:11px;font-weight:700;color:var(--mt);margin-bottom:4px}'
  +'.ct-input{width:100%;padding:9px 12px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-size:13px;box-sizing:border-box}'
  +'.ct-input:focus{outline:none;border-color:var(--ac)}'
  +'.ct-input-group{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
  +'.ct-btn{padding:12px 20px;background:var(--ac);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;width:100%;margin-top:8px}'
  +'.ct-btn:hover{opacity:.9}'
  +'.ct-card{background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:14px;margin-bottom:12px}'
  +'.ct-card-title{font-size:13px;font-weight:700;color:var(--tx);margin-bottom:8px}'
  +'.ct-card-body{font-size:12px;color:var(--mt);line-height:1.7}'
  +'.ct-theory-step{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}'
  +'.ct-step-num{min-width:28px;height:28px;border-radius:50%;background:var(--ac);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
  +'.ct-step-content{font-size:12px;color:var(--mt)}'
  +'.ct-step-title{font-weight:700;color:var(--tx);font-size:12px;margin-bottom:2px}'
  +'.ct-sym-bar{display:flex;gap:8px;margin-bottom:12px}'
  +'.ct-sym-input{flex:1;padding:9px 12px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-size:13px}'
  +'.ct-sym-btn{padding:9px 16px;background:var(--ac);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600}'
  +'@media(max-width:640px){.ct-input-group{grid-template-columns:1fr}}'
  +'</style>';
}

// ── 히어로 ──
function buildHero(){
  return '<div class="ct-hero">'
  +'<h2>🔍 차트술사 구조론 분석 도구</h2>'
  +'<p style="color:var(--mt);font-size:11px">체결→거래량→종가→사건봉→박스→도지→기능선→지지저항전환→매매시나리오</p>'
  +'</div>';
}

// ── 탭 바 ──
function buildTabBar(){
  var tabs = [
    {id:'chart', label:'📈 TradingView 차트'},
    {id:'analyze', label:'🔍 구조론 분석'},
    {id:'theory', label:'📚 이론 가이드'}
  ];
  return '<div class="ct-tab-bar">'
  + tabs.map(function(t){
    return '<button class="ct-tab" data-t="'+t.id+'" onclick="window._ctSwitchTab(\''+t.id+'\')">'+t.label+'</button>';
  }).join('')
  +'</div>';
}

// ── 탭 컨텐츠 ──
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
  +'<div style="margin-top:10px;font-size:11px;color:#4b5563;text-align:center">TradingView 차트 — 심볼을 입력해 다양한 종목 조회 가능 | 예: 005930 (삼성전자), AAPL, BTCUSDT</div>'
  +'</div>';
}

// ── 분석 탭 ──
function buildAnalyzePane(){
  return '<div class="ct-pane" data-pane="analyze" style="display:none">'
  +'<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:#f59e0b">'
  +'💡 차트에서 박스 경계, 사건봉 종가, 도지 종가를 읽어 아래 양식에 입력하면 구조론 분석이 생성됩니다.'
  +'</div>'
  +'<div class="ct-form-row">'
  +'<div class="ct-label">현재 구조 *</div>'
  +'<select id="ct-structure" class="ct-input">'
  +'<option value="box">📦 박스 구간 (횡보)</option>'
  +'<option value="trend-up">📈 상승 추세</option>'
  +'<option value="trend-down">📉 하락 추세</option>'
  +'</select></div>'
  +'<div class="ct-form-row">'
  +'<div class="ct-label">현재 가격 *</div>'
  +'<input id="ct-price" class="ct-input" type="number" placeholder="현재 가격 (예: 75000)"></div>'
  +'<div style="background:var(--s2);border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid var(--bd)">'
  +'<div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:10px">📦 박스 경계 (가장 중요)</div>'
  +'<div class="ct-input-group">'
  +'<div class="ct-form-row"><div class="ct-label">박스 상단 (저항)</div><input id="ct-box-upper" class="ct-input" type="number" placeholder="박스 상단 가격"></div>'
  +'<div class="ct-form-row"><div class="ct-label">박스 종가 클러스터 (균형)</div><input id="ct-box-close" class="ct-input" type="number" placeholder="박스 내 종가 집중 가격"></div>'
  +'</div>'
  +'<div class="ct-form-row"><div class="ct-label">박스 하단 (지지)</div><input id="ct-box-lower" class="ct-input" type="number" placeholder="박스 하단 가격"></div>'
  +'</div>'
  +'<div style="background:var(--s2);border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid var(--bd)">'
  +'<div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:10px">🕯 도지 & 사건봉</div>'
  +'<div class="ct-input-group">'
  +'<div class="ct-form-row"><div class="ct-label">도지 종가 (압축 박스 중심)</div><input id="ct-doji-close" class="ct-input" type="number" placeholder="도지 봉 종가"></div>'
  +'<div class="ct-form-row"><div class="ct-label">사건봉 종가 (대량거래 봉)</div><input id="ct-event-close" class="ct-input" type="number" placeholder="고거래량 봉 종가"></div>'
  +'</div></div>'
  +'<div class="ct-form-row">'
  +'<div class="ct-label">현재 거래량 상태</div>'
  +'<select id="ct-vol" class="ct-input">'
  +'<option value="high">📈 거래량 급증 (평균 대비 2배+)</option>'
  +'<option value="normal" selected>📊 거래량 보통</option>'
  +'<option value="low">📉 거래량 감소</option>'
  +'</select></div>'
  +'<div class="ct-form-row">'
  +'<div class="ct-label">기타 참고 사항</div>'
  +'<textarea id="ct-note" class="ct-input" rows="2" placeholder="특이사항, 뉴스, 이벤트 등 자유롭게 입력"></textarea></div>'
  +'<button class="ct-btn" onclick="window._ctAnalyze()">🔍 차트술사 구조론으로 분석</button>'
  +'<div id="ct-output"></div>'
  +'</div>';
}

// ── 이론 가이드 탭 ──
function buildTheoryPane(){
  var steps = [
    {num:1, title:'체결', desc:'시장의 실제 행동 — 누군가가 사고 판다. 체결이 쌓여 거래량이 된다.'},
    {num:2, title:'거래량', desc:'자금이 지나간 흔적. 사건봉 = 주변 대비 비정상적으로 큰 거래량. 수급 유입/이탈의 증거.'},
    {num:3, title:'종가', desc:'시장의 최종 합의 가격. 장중 고/저가는 흔적, 종가가 판정. 모든 돌파·이탈은 종가 기준.'},
    {num:4, title:'사건봉 종가', desc:'대량거래 봉의 종가 = 시장이 미래에 다시 참조하는 가격. 상승봉 종가=지지후보, 하락봉 종가=저항후보.'},
    {num:5, title:'박스', desc:'매수·매도가 균형을 이루는 합의구간. 박스 상단=저항, 하단=지지. 박스 내부=박스매매.'},
    {num:6, title:'도지', desc:'압축된 박스. 하위 프레임 횡보 → 상위 프레임 도지. 도지 종가=압축된 합의가격=기능선 후보.'},
    {num:7, title:'기능선', desc:'실제로 지지·저항 기능을 수행한 가격. 기능 수행 후 인정. 반복 수행할수록 격이 높아진다.'},
    {num:8, title:'지지·저항 전환', desc:'저항 종가 돌파 → 지지로 전환. 지지 종가 이탈 → 저항으로 전환. 스위치 원리.'},
    {num:9, title:'박스매매 / 추세매매', desc:'박스 안=박스매매(하단매수·상단매도). 박스 밖=추세매매(돌파후눌림or이탈후되돌림).'},
    {num:10, title:'진입·손절·익절', desc:'진입 근거 설정 → 근거 상실 시 즉시 손절. 익절=다음 기능선 도달. 고정비율 금지.'}
  ];

  var rules = [
    '종가 기준이 아닌 장중 돌파만으로 판단하지 않는다.',
    '도지를 단순 캔들 패턴으로만 해석하지 않는다.',
    '박스와 추세를 구분하지 않고 분석하지 않는다.',
    '거래량 없는 돌파를 신뢰도 높게 평가하지 않는다.',
    '기능선이 사라졌는데도 새 이유를 붙여 보유하지 않는다.',
    '갭 자체만 보고 의미를 부여하지 않는다.',
    '손절 기준 없이 상승/하락 가능성만 말하지 않는다.',
    '현재가와 가깝다는 이유만으로 지지·저항을 선택하지 않는다.'
  ];

  return '<div class="ct-pane" data-pane="theory" style="display:none">'
  +'<div class="ct-card">'
  +'<div class="ct-card-title">📊 차트술사 구조론 핵심 흐름</div>'
  + steps.map(function(s){
    return '<div class="ct-theory-step">'
    +'<div class="ct-step-num">'+s.num+'</div>'
    +'<div class="ct-step-content"><div class="ct-step-title">'+s.title+'</div>'+s.desc+'</div>'
    +'</div>';
  }).join('')
  +'</div>'
  +'<div class="ct-card">'
  +'<div class="ct-card-title">⛔ 절대 금지 규칙</div>'
  +'<div class="ct-card-body">'
  + rules.map(function(r){ return '• '+r; }).join('<br>')
  +'</div></div>'
  +'<div class="ct-card">'
  +'<div class="ct-card-title">🎯 핵심 공식</div>'
  +'<div class="ct-card-body">'
  +'<strong style="color:var(--tx)">박스 안</strong> → 박스매매 (하단 매수·상단 매도)<br>'
  +'<strong style="color:var(--tx)">박스 밖 (상방)</strong> → 눌림매매 (이전 저항→지지 전환 확인)<br>'
  +'<strong style="color:var(--tx)">박스 밖 (하방)</strong> → 되돌림 매도 (이전 지지→저항 전환 확인)<br>'
  +'<strong style="color:var(--tx)">근거 상실</strong> → 즉시 손절 (새 이유 금지)<br><br>'
  +'<strong style="color:#f59e0b">도지 내부시점</strong> = 박스매매<br>'
  +'• 도지 하단~종가: 매수 우위 | 손절 = 하단 종가 이탈<br>'
  +'• 도지 종가~상단: 매도 우위 | 손절 = 상단 종가 돌파<br><br>'
  +'<strong style="color:#22c55e">도지 외부시점 (상방)</strong> = 추세매매<br>'
  +'• 1차 매수: 도지 상단 지지 | 2차 매수: 도지 종가 | 손절: 도지 하단 이탈<br><br>'
  +'<strong style="color:#ef4444">도지 외부시점 (하방)</strong> = 추세매매<br>'
  +'• 1차 매도: 도지 하단 저항 | 2차 매도: 도지 종가 | 손절: 도지 상단 돌파'
  +'</div></div>'
  +'<div style="font-size:11px;color:#4b5563;text-align:center;margin-top:4px">'
  +'차트술사 구조론 — 차트는 미래 예언이 아닌 시장 참여자들의 합의 역사책이다'
  +'</div>'
  +'</div>';
}

})();
