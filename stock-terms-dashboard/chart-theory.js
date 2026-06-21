// ═══ 차트 분석 도구 v3 ═══
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
  // 기본 종목 자동 분석
  setTimeout(function(){ window._ctAutoAnalyze(_ctSymbol); }, 500);
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
    timezone:'Asia/Seoul', theme:document.body.classList.contains('light')?'light':'dark',
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
  // 숫자만 → 한국 주식 (KRX: 붙임)
  // 영문 포함 → 미국주식/암호화폐: TradingView가 자동 해석하므로 그대로 사용
  if(/^\d+$/.test(sym)) sym = 'KRX:'+sym;
  _ctSymbol = sym; _tvLoaded = false;
  var box = document.getElementById('ct-tv-box');
  if(box) box.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--mt);font-size:13px">차트 로딩 중...</div>';
  setTimeout(function(){ initTV(); _tvLoaded=true; }, 50);
  // 자동 분석 실행
  window._ctAutoAnalyze(sym);
};

// ══════════════════════════════════════
// ── 자동 분석 (Yahoo Finance) ──
// ══════════════════════════════════════

// TradingView 심볼 → Yahoo Finance 티커 변환
function toYahooTicker(sym){
  // KRX:/KRSE: 등 거래소 접두사 제거
  sym = sym.toUpperCase().replace(/^(KRX|KRSE|NASDAQ|NYSE|AMEX|BINANCE|COINBASE):/,'').trim();
  // 한국 주식 (6자리 숫자)
  if(/^\d{6}$/.test(sym)) return sym + '.KS';
  if(/^\d{4,6}\.KS$/.test(sym)||/^\d{4,6}\.KQ$/.test(sym)) return sym;
  // 암호화폐
  if(sym.endsWith('USDT')) return sym.replace('USDT','-USD');
  if(sym==='BTC'||sym==='BTC-USD') return 'BTC-USD';
  if(sym==='ETH'||sym==='ETH-USD') return 'ETH-USD';
  // 미국 주식 (영문 1~5자) — 그대로 Yahoo에 전달
  return sym;
}

// 단일 URL 시도 — Yahoo chart JSON 반환 또는 {error:'...'} 반환
async function _tryFetch(url, ms){
  var ctrl = new AbortController();
  var timer = setTimeout(function(){ ctrl.abort(); }, ms);
  try {
    var resp = await fetch(url, {signal: ctrl.signal});
    clearTimeout(timer);
    if(!resp.ok) return {error:'HTTP '+resp.status};
    var text = await resp.text();
    if(!text || text.length < 50) return {error:'empty'};
    var json;
    try { json = JSON.parse(text); } catch(e){ return {error:'parse'}; }
    // allorigins /get: {contents:"..."}
    if(json && typeof json.contents === 'string'){
      try { json = JSON.parse(json.contents); } catch(e){ return {error:'parse2'}; }
    }
    if(json && json.chart && json.chart.result && json.chart.result[0]) return {ok:json};
    if(json && json.chart && json.chart.error) return {error:'YF:'+JSON.stringify(json.chart.error)};
    return {error:'no_result'};
  } catch(e){
    clearTimeout(timer);
    return {error: e.name==='AbortError'?'timeout':e.message||'net'};
  }
}

// 여러 Promise 중 첫 번째 성공(.ok) 값 반환, 모두 실패 시 오류 목록 반환
function _raceSuccess(promises){
  return new Promise(function(resolve){
    var remaining = promises.length, errors = [];
    if(!remaining){ resolve({errors:[]}); return; }
    promises.forEach(function(p, idx){
      Promise.resolve(p).then(function(r){
        if(r && r.ok){ resolve({ok:r.ok, errors:errors}); }
        else {
          errors[idx] = r ? r.error : 'null';
          if(--remaining === 0) resolve({errors:errors});
        }
      }).catch(function(e){
        errors[idx] = e.message||'err';
        if(--remaining === 0) resolve({errors:errors});
      });
    });
  });
}

// Yahoo Finance 데이터 페치 — 5개 프록시 병렬, query1/query2 순차 fallback
async function fetchYahoo(ticker){
  var yUrls = [
    'https://query1.finance.yahoo.com/v8/finance/chart/'+ticker+'?interval=1d&range=6mo&includePrePost=false',
    'https://query2.finance.yahoo.com/v8/finance/chart/'+ticker+'?interval=1d&range=6mo&includePrePost=false',
  ];
  var mkProxy = [
    function(u){ return 'https://proxy.cors.sh/'+u; },
    function(u){ return 'https://corsproxy.io/?'+encodeURIComponent(u); },
    function(u){ return 'https://api.allorigins.win/raw?url='+encodeURIComponent(u); },
    function(u){ return 'https://api.allorigins.win/get?url='+encodeURIComponent(u); },
    function(u){ return 'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(u); },
  ];
  var lastErrors = [];
  for(var yi=0; yi<yUrls.length; yi++){
    var u = yUrls[yi];
    var r = await _raceSuccess(mkProxy.map(function(mk){ return _tryFetch(mk(u), 12000); }));
    if(r.ok) return {data:r.ok, errors:[]};
    lastErrors = r.errors;
  }
  return {data:null, errors:lastErrors};
}

// 자동 분석 메인 함수
window._ctAutoAnalyze = async function(symbol){
  var out = document.getElementById('ct-auto-output');
  if(!out) return;
  out.innerHTML = loading(symbol);

  var ticker = toYahooTicker(symbol);
  var fetched = await fetchYahoo(ticker);

  // 한국 KOSDAQ fallback
  if(!fetched.data && /^\d{6}\.KS$/.test(ticker)){
    var fetched2 = await fetchYahoo(ticker.replace('.KS','.KQ'));
    if(fetched2.data) fetched = fetched2;
    else fetched.errors = (fetched.errors||[]).concat(fetched2.errors||[]);
  }

  if(!fetched.data){
    var errInfo = (fetched.errors||[]).filter(Boolean).slice(0,3).join(' / ');
    out.innerHTML = '<div style="margin-top:12px;padding:16px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:10px">'
    +'<div style="font-size:13px;font-weight:700;color:#ef4444;margin-bottom:8px">⚠ 시세 데이터 수집 불가</div>'
    +'<div style="font-size:12px;color:var(--mt);line-height:1.7;margin-bottom:12px">'
    +'Yahoo Finance CORS 차단으로 자동 수집에 실패했습니다.<br>'
    +(errInfo?'<span style="font-size:10px;color:#4b5563">진단: '+errInfo+'</span><br>':'')
    +'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<button onclick="window._ctSwitchTab(\'analyze\')" style="flex:1;padding:10px;background:var(--ac);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">🔍 직접 입력으로 분석</button>'
    +'<a href="https://finance.yahoo.com/quote/'+ticker+'" target="_blank" style="flex:1;padding:10px;background:var(--s2);color:var(--tx);border:1px solid var(--bd);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;text-decoration:none;display:flex;align-items:center;justify-content:center">📊 Yahoo Finance에서 확인</a>'
    +'</div>'
    +'<div style="margin-top:10px;font-size:11px;color:#4b5563">TradingView 차트는 위에서 정상 표시됩니다. 가격·박스를 읽어 직접 입력 탭에 넣으면 분석이 실행됩니다.</div>'
    +'</div>';
    return;
  }

  try {
    var res  = fetched.data.chart.result[0];
    var meta = res.meta;
    var q    = res.indicators.quote[0];

    // 날짜 동기화: 행 단위로 null 제거 (closes/vols 인덱스 불일치 방지)
    var pairs = (res.timestamp||[]).map(function(_,i){
      return {c:q.close[i], o:q.open[i], h:q.high[i], l:q.low[i], v:q.volume[i]};
    }).filter(function(d){
      return d.c!=null && d.o!=null && d.h!=null && d.l!=null
          && +d.c>0 && +d.h>0 && +d.l>0;
    });
    var closes = pairs.map(function(d){return +d.c;});
    var opens  = pairs.map(function(d){return +d.o;});
    var highs  = pairs.map(function(d){return +d.h;});
    var lows   = pairs.map(function(d){return +d.l;});
    var vols   = pairs.map(function(d){return +d.v||0;});

    // closes 정의 이후에 길이 체크 (이전 순서 버그 수정)
    if(closes.length < 5){
      out.innerHTML = '<div style="padding:12px;color:#f59e0b;font-size:12px">⚠ 데이터 부족. 수동 분석 탭을 이용해 주세요.</div>';
      return;
    }

    var curPrice = meta.regularMarketPrice || closes[closes.length-1];
    var currency = meta.currency || 'KRW';
    var name     = meta.shortName || ticker;

    var aData = computeAutoAnalysis(closes, opens, highs, lows, vols, curPrice);
    aData.currency = currency;
    aData.note = name + ' | ' + ticker + ' | 일봉 6개월 자동 감지 (Yahoo Finance)';

    out.innerHTML = buildDetectedBadge(aData, curPrice, currency, name) + generateAnalysis(aData);

    // 구조론 분석 폼에도 값 채워 넣기
    fillForm(aData);

  } catch(e){
    out.innerHTML = '<div style="padding:12px;color:#ef4444;font-size:12px">⚠ 분석 오류: '+e.message+'</div>';
  }
};

// 로딩 표시
function loading(sym){
  return '<div style="margin-top:12px;padding:20px 16px;text-align:center;background:var(--s2);border:1px solid var(--bd);border-radius:10px">'
  +'<div style="font-size:26px;margin-bottom:8px;display:inline-block;animation:ct-spin 1.2s linear infinite">⏳</div>'
  +'<div style="font-size:13px;font-weight:600;color:var(--tx);margin-bottom:4px">'+sym+' 데이터 수집 중...</div>'
  +'<div style="font-size:11px;color:#4b5563">4개 서버 동시 연결 · 최초 10초 소요될 수 있습니다</div>'
  +'<style>@keyframes ct-spin{to{transform:rotate(360deg)}}</style></div>';
}

// ── 자동 분석 알고리즘 ──
function computeAutoAnalysis(closes, opens, highs, lows, vols, currentPrice){
  var n = closes.length;
  // 버그3 수정: 빈배열 나누기 0 방어
  var avgArr = function(a){ return a.length ? a.reduce(function(s,x){return s+x;},0)/a.length : 0; };
  var medArr = function(a){ if(!a.length) return 0; var s=[].concat(a).sort(function(x,y){return x-y;}); return s[Math.floor(s.length/2)]; };

  // 이동평균
  var sma20 = avgArr(closes.slice(-Math.min(20,n)));
  var sma60 = avgArr(closes.slice(-Math.min(60,n)));

  // 추세 판단
  var structure = 'box';
  if(currentPrice > sma20*1.005 && sma20 > sma60*1.005) structure = 'trend-up';
  else if(currentPrice < sma20*0.995 && sma20 < sma60*0.995) structure = 'trend-down';

  // 박스 감지 — 최근 20일 기본
  var wn = Math.min(20, n);
  var rH = highs.slice(-wn), rL = lows.slice(-wn), rC = closes.slice(-wn);
  var boxUpper = Math.max.apply(null, rH);
  var boxLower = Math.min.apply(null, rL);
  var boxClose = medArr(rC);

  // 최근 10일 더 좁은 구간 있으면 교체
  if(n >= 10){
    var tH = Math.max.apply(null, highs.slice(-10));
    var tL = Math.min.apply(null, lows.slice(-10));
    if((tH-tL)/currentPrice < (boxUpper-boxLower)/currentPrice * 0.65 && (tH-tL)/currentPrice < 0.12){
      boxUpper = tH; boxLower = tL; boxClose = medArr(closes.slice(-10));
    }
  }

  // 평균 거래량
  var avgVol = avgArr(vols.slice(-Math.min(60, vols.length)));

  // 사건봉 — 최근 60일 중 거래량 2배 이상, 가장 최근 것
  var eventClose = 0;
  for(var i = n-1; i >= Math.max(0, n-60); i--){
    if(vols[i] && vols[i] > avgVol*2.0 && closes[i]){ eventClose = closes[i]; break; }
  }

  // 도지 감지 — 최근 15일 중 몸통 < 20%, 레인지 > 0.3%
  var dojiU=0, dojiC=0, dojiL=0, dojiType='none';
  for(var i = n-1; i >= Math.max(0, n-15); i--){
    var body = Math.abs(closes[i]-opens[i]);
    var range = highs[i]-lows[i];
    if(range > currentPrice*0.003 && body/range < 0.2){
      dojiU = highs[i]; dojiC = closes[i]; dojiL = lows[i];
      var before = avgArr(closes.slice(Math.max(0,i-5), i));
      var after  = closes[Math.min(n-1, i+1)];
      dojiType = ((after > before) === (closes[i] > before)) ? 'strength' : 'reversal';
      break;
    }
  }

  // 거래량 수준
  var curVol = vols[n-1] || vols[n-2] || avgVol;
  var volLevel = curVol > avgVol*1.8 ? 'high' : curVol < avgVol*0.6 ? 'low' : 'normal';

  // 거래량 맥락
  var volContext = 'none';
  var prev3 = avgArr(closes.slice(-4,-1));
  if(currentPrice > boxUpper*0.99)       volContext = 'breakout';
  else if(currentPrice < boxLower*1.01)  volContext = 'breakdown';
  else if(currentPrice > prev3*1.005)    volContext = 'bounce';
  else if(currentPrice < prev3*0.995)    volContext = 'pullback';

  // 버그2 수정: USD 소수점 유지 (150.25 → 150.25, KRW 75000 → formatPrice에서 원 단위로 처리)
  var rnd = function(x){ return x>0 ? Math.round(x*100)/100 : 0; };
  return {
    structure: structure, frame: 'daily',
    currentPrice: rnd(currentPrice),
    boxUpper: rnd(boxUpper), boxClose: rnd(boxClose), boxLower: rnd(boxLower),
    dojiUpper: rnd(dojiU), dojiClose: rnd(dojiC), dojiLower: rnd(dojiL), dojiType: dojiType,
    eventClose: rnd(eventClose),
    volLevel: volLevel, volContext: volContext,
    gap: 'none', retest: 'pending', note: ''
  };
}

// 감지된 기준값 뱃지
function buildDetectedBadge(d, price, currency, name){
  var fp2 = function(v){ return formatPrice(v, currency); };
  var structStr = d.structure==='box'?'📦 박스 구간':d.structure==='trend-up'?'📈 상승 추세':'📉 하락 추세';
  return '<div style="margin-top:12px;background:rgba(59,130,246,.07);border:1px solid rgba(59,130,246,.25);border-radius:10px;padding:14px;margin-bottom:4px">'
  +'<div style="font-size:12px;font-weight:700;color:#60a5fa;margin-bottom:8px">🤖 자동 감지 결과 — '+name+'</div>'
  +'<div style="font-size:12px;color:var(--mt);line-height:1.9">'
  +'현재가 <b style="color:var(--tx)">'+fp2(price)+'</b> &nbsp;|&nbsp; 감지 구조 <b style="color:var(--tx)">'+structStr+'</b><br>'
  +'박스 <b style="color:#ef4444">'+fp2(d.boxUpper)+'</b>'
  +' / <b style="color:var(--tx)">'+fp2(d.boxClose)+'</b>'
  +' / <b style="color:#22c55e">'+fp2(d.boxLower)+'</b>'
  +(d.dojiClose>0?' &nbsp;|&nbsp; 도지 종가 <b style="color:#f59e0b">'+fp2(d.dojiClose)+'</b>':'')
  +(d.eventClose>0?' &nbsp;|&nbsp; 사건봉 종가 <b style="color:#f97316">'+fp2(d.eventClose)+'</b>':'')
  +'</div>'
  +'<div style="margin-top:6px;font-size:10px;color:#4b5563">⚠ 알고리즘 추정값 — 정밀 분석은 🔍 구조론 분석 탭에서 수동 보정 후 재실행하세요.</div>'
  +'</div>';
}

// 구조론 분석 폼 자동 채우기
function fillForm(d){
  var set = function(id, val){
    var el = document.getElementById(id);
    if(el && val!==undefined && val!==null && val!==0) el.value = val;
  };
  set('ct-structure', d.structure);
  set('ct-frame',     d.frame||'daily');
  set('ct-price',     d.currentPrice);
  set('ct-box-upper', d.boxUpper);
  set('ct-box-close', d.boxClose);
  set('ct-box-lower', d.boxLower);
  set('ct-doji-upper',d.dojiUpper);
  set('ct-doji-close',d.dojiClose);
  set('ct-doji-lower',d.dojiLower);
  set('ct-doji-type', d.dojiType);
  set('ct-event-close',d.eventClose);
  set('ct-vol',       d.volLevel);
  set('ct-vol-context',d.volContext);
  set('ct-currency',  d.currency||'KRW');
  set('ct-note',      d.note);
}

// ══════════════════════════════════════
// ── 수동 분석 실행 ──
// ══════════════════════════════════════
window._ctAnalyze = function(){
  var f = function(id){ return parseFloat(document.getElementById(id).value)||0; };
  var s = function(id){ return document.getElementById(id).value; };
  var data = {
    structure:   s('ct-structure'),
    frame:       s('ct-frame'),
    currentPrice: f('ct-price'),
    boxUpper:    f('ct-box-upper'),
    boxClose:    f('ct-box-close'),
    boxLower:    f('ct-box-lower'),
    dojiUpper:   f('ct-doji-upper'),
    dojiClose:   f('ct-doji-close'),
    dojiLower:   f('ct-doji-lower'),
    dojiType:    s('ct-doji-type'),
    eventClose:  f('ct-event-close'),
    volLevel:    s('ct-vol'),
    volContext:  s('ct-vol-context'),
    gap:         s('ct-gap'),
    retest:      s('ct-retest'),
    currency:    s('ct-currency'),
    note:        s('ct-note')
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
  // 통화 포맷 단축 함수
  var fp = function(v){ return formatPrice(v, d.currency||'KRW'); };

  if(!p && !bu && !bl && !du && !dl){
    return '<div style="padding:16px;color:#f59e0b;font-size:13px">⚠ 현재 가격과 박스 또는 도지 경계를 입력해 주세요.</div>';
  }

  var hasDoji = du>0 && dl>0 && dc>0;
  var hasBox  = bu>0 && bl>0;
  if(hasBox && bc===0) bc = Math.round((bu+bl)/2);

  var gradeMap = {monthly:'S급(월봉)', weekly:'A급(주봉)', daily:'B급(일봉)', h4:'C급(4H)', h1:'C급(1H)'};
  var grade = gradeMap[d.frame] || 'B급(일봉)';

  // 갭 해석
  var gapText='', gapWarn='';
  if(d.gap==='up-above'){
    gapText='상승갭이 핵심 저항 위에서 발생 → 저항 돌파 → 지지 전환 가능성 → 눌림 대기';
    gapWarn='⚡ 거래 없이 돌파됐으므로 리테스트 필수 확인';
  } else if(d.gap==='up-below'){
    gapText='상승갭이 핵심 저항 아래 → 저항 미돌파 → 기존 저항 유지 → 관찰';
    gapWarn='⚠ 갭 상승이었으나 저항을 넘지 못함';
  } else if(d.gap==='down-below'){
    gapText='하락갭이 핵심 지지 아래 → 지지 이탈 → 저항 전환 가능성 → 반등 매도 대기';
    gapWarn='⚡ 거래 없이 이탈됐으므로 리테스트 필수 확인';
  } else if(d.gap==='down-above'){
    gapText='하락갭이 핵심 지지 위 → 지지 미이탈 → 기존 지지 유지 → 관찰';
    gapWarn='⚠ 갭 하락이었으나 지지를 이탈하지 못함';
  }

  // 거래량 맥락
  var vl=d.volLevel, vc=d.volContext, volText='';
  if(vc==='breakout') volText = vl==='high'?'✅ 돌파+급증 → 수급 유입, 신뢰도 높음':vl==='low'?'⚠ 돌파+거래량 부족 → 신뢰도 낮음, 리테스트 필수':'📊 돌파+보통 → 리테스트 확인 후 판단';
  else if(vc==='pullback') volText = vl==='low'?'✅ 눌림+감소 → 매도 압력 약화, 진입 타점 접근':vl==='high'?'⚠ 눌림+급증 → 매도 압력 강함, 추가 조정 가능':'📊 눌림+보통 → 지지 확인 후 판단';
  else if(vc==='breakdown') volText = vl==='high'?'✅ 이탈+급증 → 수급 이탈, 신뢰도 높음':vl==='low'?'⚠ 이탈+부족 → 신뢰도 낮음, 반등 확인 필요':'📊 이탈+보통 → 되돌림 확인 후 판단';
  else if(vc==='bounce') volText = vl==='low'?'✅ 반등+감소 → 매수 압력 약화, 매도 타점 접근':vl==='high'?'⚠ 반등+급증 → 매수세 유입, 반등 강도 주의':'📊 반등+보통 → 저항 확인 후 판단';
  else volText = vl==='high'?'거래량 급증 → 수급 집중':vl==='low'?'거래량 감소 → 참여자 관망':'거래량 보통 → 추세 확인 필요';

  var posStr='', recommendation='', scenarios=[], entries=[], stopLoss='', targets=[], finalJudge='';
  var supportC=[], resistC=[], removedC=[];

  // ── 도지 기반 전략 ──
  if(hasDoji){
    if(p>=dl && p<=du){
      if(p<=dc){
        posStr='도지 내부 / 하단~종가 (매수 우위)'; recommendation='도지 내부 매수 전략 (박스매매)';
        entries=['1차: '+fp(dc)+' 근처 (도지 종가)', '2차: '+fp(dl)+' 근처 (도지 하단)'];
        stopLoss=fp(dl)+' 종가 이탈 → 즉시 손절';
        targets=['1차: '+fp(du)+' (도지 상단)', '2차: 도지 상단 돌파 후 다음 기능선'];
        scenarios=['시나리오 A: 도지 하단 지지 → 종가 회복 → 상단 도전','시나리오 B: '+fp(dl)+' 이탈 → 즉시 손절'];
        supportC=['도지 종가 '+fp(dc)+'(균형)', '도지 하단 '+fp(dl)+'(매수 경계)'];
        resistC =['도지 상단 '+fp(du)+'(매도 경계)'];
        finalJudge='매수 가능 (도지 내부 분할 매수)';
      } else {
        posStr='도지 내부 / 종가~상단 (매도 우위)'; recommendation='도지 내부 매도 전략 (박스매매)';
        entries=['1차: '+fp(du)+' 근처 (도지 상단)', '2차: '+fp(dc)+' 근처 (도지 종가)'];
        stopLoss=fp(du)+' 종가 돌파 → 즉시 손절 (상방 전환)';
        targets=['1차: '+fp(dc)+' (도지 종가)', '2차: '+fp(dl)+' (도지 하단)'];
        scenarios=['시나리오 A: 도지 상단 저항 → 종가 이탈 → 하단 도전','시나리오 B: '+fp(du)+' 돌파 → 즉시 손절'];
        resistC=['도지 상단 '+fp(du)+'(매도 경계)', '도지 종가 '+fp(dc)+'(균형)'];
        supportC=['도지 하단 '+fp(dl)+'(매수 경계)'];
        finalJudge='매도 가능 (도지 내부 분할 매도)';
      }
    } else if(p>du){
      posStr='도지 상단 위 — 외부 상방 (추세매매)';
      supportC=['도지 상단 '+fp(du)+'(저항→지지 후보)', '도지 종가 '+fp(dc)+'(2차 지지)'];
      if(bu) resistC.push('박스 상단 '+fp(bu)+'(다음 저항)');
      removedC=[{price:'도지 하단 '+fp(dl), reason:'상방 돌파 시 1차 기능선에서 제외'}];
      if(d.retest==='pending'){
        recommendation='상방 돌파 확인 — 눌림(리테스트) 대기 중';
        entries=['1차 대기: '+fp(du)+' 지지 전환 확인 후', '2차 대기: '+fp(dc)+' (추가 조정 시)'];
        stopLoss=fp(dc)+' 이탈 → 눌림 실패 / '+fp(dl)+' 이탈 → 완전 실패';
        targets=['1차: 직전 고점','2차: 추세 가속 후 다음 저항'];
        scenarios=['시나리오 A: 눌림 → '+fp(du)+' 지지 → 재상승','시나리오 B: '+fp(dc)+' 이탈 → 박스매매 전환'];
        finalJudge='대기 (리테스트 발생 대기)';
      } else if(d.retest==='done'){
        recommendation='리테스트 완료 — 도지 상단 지지 확인 후 매수';
        entries=['1차 매수: '+fp(du)+' 지지 확인 완료', '2차 매수: '+fp(dc)+' (추가 조정 시)'];
        stopLoss=fp(dl)+' 종가 이탈 → 완전 구조 붕괴 즉시 손절';
        targets=['1차: 직전 고점','2차: 추세 가속'];
        scenarios=['시나리오 A: 지지 확정 → 재상승 가속','시나리오 B: '+fp(dc)+' 이탈 → 손절'];
        finalJudge='매수 가능 (리테스트 성공)';
      } else {
        recommendation='리테스트 실패 — 구조 재평가 필요';
        entries=['새로운 기능선 재설정 후 재분석']; stopLoss=fp(dl)+' 이탈 → 완전 붕괴';
        scenarios=['시나리오 A: 현 가격 재지지 형성','시나리오 B: 하락 지속 → 하위 기능선 확인'];
        targets=[]; finalJudge='무포지션 (재평가 대기)';
      }
    } else {
      posStr='도지 하단 아래 — 외부 하방 (추세매매)';
      resistC=['도지 하단 '+fp(dl)+'(지지→저항 후보)', '도지 종가 '+fp(dc)+'(2차 저항)'];
      if(bl) supportC.push('박스 하단 '+fp(bl)+'(다음 지지)');
      removedC=[{price:'도지 상단 '+fp(du), reason:'하방 이탈 시 1차 기능선에서 제외'}];
      if(d.retest==='pending'){
        recommendation='하방 이탈 확인 — 반등(리테스트) 대기 중';
        entries=['1차 대기: '+fp(dl)+' 저항 전환 확인 후', '2차 대기: '+fp(dc)+' (추가 반등 시)'];
        stopLoss=fp(dc)+' 돌파 → 실패 / '+fp(du)+' 돌파 → 완전 실패';
        targets=['1차: 직전 저점','2차: 추세 하락 가속'];
        scenarios=['시나리오 A: 반등 → '+fp(dl)+' 저항 → 재하락','시나리오 B: '+fp(dc)+' 돌파 → 박스매매 전환'];
        finalJudge='대기 (반등 발생 대기)';
      } else if(d.retest==='done'){
        recommendation='리테스트 완료 — 도지 하단 저항 확인 후 매도';
        entries=['1차 매도: '+fp(dl)+' 저항 확인 완료', '2차 매도: '+fp(dc)+' (추가 반등 시)'];
        stopLoss=fp(du)+' 종가 돌파 → 완전 구조 붕괴 즉시 손절';
        targets=['1차: 직전 저점','2차: 추세 하락 가속'];
        scenarios=['시나리오 A: 저항 확정 → 재하락 가속','시나리오 B: '+fp(dc)+' 돌파 → 손절'];
        finalJudge='매도 가능 (리테스트 성공)';
      } else {
        recommendation='리테스트 실패 — 구조 재평가 필요';
        entries=['새로운 기능선 재설정 후 재분석']; stopLoss=fp(du)+' 돌파 → 완전 붕괴';
        scenarios=['시나리오 A: 현 가격 재저항 형성','시나리오 B: 반등 지속 → 상위 기능선 확인'];
        targets=[]; finalJudge='무포지션 (재평가 대기)';
      }
    }

  // ── 박스 기반 전략 ──
  } else if(hasBox){
    if(p>=bl && p<=bc){
      posStr='박스 하단~종가 (매수 우위)'; recommendation='박스 하단 매수 전략 (박스매매)';
      entries=['1차: '+fp(bc)+' 근처 (박스 종가)', '2차: '+fp(bl)+' 근처 (박스 하단)'];
      stopLoss=fp(bl)+' 종가 이탈 → 즉시 손절';
      targets=['1차: '+fp(bu)+' (박스 상단)', '2차: 상단 돌파 후 다음 기능선'];
      scenarios=['시나리오 A: 박스 하단 지지 → 종가 회복 → 상단 도전','시나리오 B: '+fp(bl)+' 이탈 → 즉시 손절'];
      supportC=['박스 종가 '+fp(bc)+'(균형)', '박스 하단 '+fp(bl)+'(지지)'];
      resistC=['박스 상단 '+fp(bu)+'(저항)'];
      removedC=[{price:'박스 내 단순 스윙 저점', reason:'거래량 없는 단기 흔적'}];
      finalJudge='매수 가능 (박스 하단 분할 매수)';
    } else if(p>bc && p<=bu){
      posStr='박스 종가~상단 (매도 우위)'; recommendation='박스 상단 매도 전략 (박스매매)';
      entries=['1차: '+fp(bu)+' 근처 (박스 상단)', '2차: '+fp(bc)+' 근처 (박스 종가)'];
      stopLoss=fp(bu)+' 종가 돌파 → 즉시 손절 (지지 전환)';
      targets=['1차: '+fp(bc)+' (박스 종가)', '2차: '+fp(bl)+' (박스 하단)'];
      scenarios=['시나리오 A: 박스 상단 저항 → 종가 이탈 → 하단 도전','시나리오 B: '+fp(bu)+' 돌파 → 즉시 손절'];
      resistC=['박스 상단 '+fp(bu)+'(저항)', '박스 종가 '+fp(bc)+'(균형)'];
      supportC=['박스 하단 '+fp(bl)+'(지지)'];
      removedC=[{price:'박스 내 단순 스윙 고점', reason:'거래량 없는 단기 흔적'}];
      finalJudge='매도 가능 (박스 상단 분할 매도)';
    } else if(p>bu){
      posStr='박스 상단 위 (상방 이탈 — 눌림매매)'; recommendation='눌림매매 대기 — 박스 상단 지지 전환 확인';
      entries=['1차 대기: '+fp(bu)+' 지지 전환 확인', '2차 대기: '+fp(bc)+' (박스 종가)'];
      stopLoss=fp(bc)+' 종가 이탈 → 눌림 실패 손절';
      targets=['1차: 이전 고점 또는 다음 저항', '2차: 추세 가속'];
      scenarios=['시나리오 A: 눌림 → '+fp(bu)+' 지지 → 재상승','시나리오 B: '+fp(bc)+' 이탈 → 박스매매 전환'];
      supportC=['박스 상단 '+fp(bu)+'(저항→지지 후보)', '박스 종가 '+fp(bc)+'(2차 지지)'];
      removedC=[{price:'최근 단순 스윙 고점', reason:'거래량/체류시간 근거 없는 단기 고점'}];
      finalJudge='대기 → 눌림목 확인 후 매수';
    } else {
      posStr='박스 하단 아래 (하방 이탈 — 되돌림 매도)'; recommendation='되돌림 매도 대기 — 박스 하단 저항 전환 확인';
      entries=['1차 대기: '+fp(bl)+' 저항 전환 확인', '2차 대기: '+fp(bc)+' (박스 종가)'];
      stopLoss=fp(bc)+' 종가 돌파 → 되돌림 실패 손절';
      targets=['1차: 이전 저점 또는 다음 지지', '2차: 추세 하락 가속'];
      scenarios=['시나리오 A: 반등 → '+fp(bl)+' 저항 → 재하락','시나리오 B: '+fp(bc)+' 돌파 → 박스매매 전환'];
      resistC=['박스 하단 '+fp(bl)+'(지지→저항 후보)', '박스 종가 '+fp(bc)+'(2차 저항)'];
      removedC=[{price:'최근 단순 스윙 저점', reason:'거래량/체류시간 근거 없는 단기 저점'}];
      finalJudge='대기 → 되돌림 확인 후 매도';
    }
  } else {
    posStr='기능선 미특정'; recommendation='박스 경계 또는 도지 상단/종가/하단을 입력해 주세요.';
    finalJudge='무포지션 (기능선 미특정)';
  }

  // 사건봉 추가
  if(ec){ (p>=ec ? supportC : resistC).push('사건봉 종가 '+fp(ec)+'(대량거래 합의)'); }

  var dojiTypeText = d.dojiType==='strength'?'추세강화도지 — 추세 중간 에너지 재충전. 재방문 시 강한 지지/저항':
                    d.dojiType==='reversal'?'추세반전도지 — 추세 전환 기준점. 재침범 시 새 추세 훼손 신호':'';

  var fLines=[];
  if(du) fLines.push('도지 상단: '+fp(du));
  if(dc) fLines.push('도지 종가: '+fp(dc)+' ← 압축된 합의가격');
  if(dl) fLines.push('도지 하단: '+fp(dl));
  if(bu) fLines.push('박스 상단: '+fp(bu));
  if(bc&&hasBox) fLines.push('박스 종가 클러스터: '+fp(bc));
  if(bl) fLines.push('박스 하단: '+fp(bl));
  if(ec) fLines.push('사건봉 종가: '+fp(ec)+' ← 대량거래 후 합의');

  var color  = finalJudge.includes('매수')?'#22c55e':finalJudge.includes('매도')?'#ef4444':'#f59e0b';
  var bgC    = finalJudge.includes('매수')?'rgba(34,197,94,.12)':finalJudge.includes('매도')?'rgba(239,68,68,.12)':'rgba(245,158,11,.12)';
  var structLabel = (d.structure==='box'?'📦 박스 구간':d.structure==='trend-up'?'📈 상승 추세':'📉 하락 추세')+' | 格: '+grade;

  return '<div style="background:var(--s2);border-radius:12px;border:1px solid var(--bd);padding:20px;margin-top:4px">'
  +'<div style="font-size:15px;font-weight:800;margin-bottom:14px;color:var(--tx)">📊 차트 분석 결과</div>'
  +row('1. 현재 구조', structLabel)
  +row('2. 분석 관점', recommendation)
  +row('3. 가격 위치', (p?fp(p):'미입력')+' — '+posStr)
  +section('4. 핵심 기능선', fLines.length?fLines.map(function(l){return '• '+l;}).join('<br>'):'미입력')
  +(dojiTypeText?row('4-1. 도지 타입', dojiTypeText):'')
  +section('5. 핵심 지지 후보', supportC.length?supportC.map(function(s,i){return '• '+(i===0?'1차: ':i===1?'2차: ':'보조: ')+s;}).join('<br>'):'해당 없음')
  +section('6. 핵심 저항 후보', resistC.length?resistC.map(function(s,i){return '• '+(i===0?'1차: ':i===1?'2차: ':'보조: ')+s;}).join('<br>'):'해당 없음')
  +(removedC.length?section('7. 제거한 후보', removedC.map(function(r){return '• <s>'+r.price+'</s> — '+r.reason;}).join('<br>')):'')
  +(gapText?section('8. 갭 해석', '• '+gapText+(gapWarn?'<br>• '+gapWarn:'')):'')
  +section('거래량 해석', '• '+volText)
  +section('매매 시나리오', scenarios.map(function(s){return '• '+s;}).join('<br>'))
  +section('진입 전략', entries.map(function(e){return '• '+e;}).join('<br>'))
  +row('손절 기준', '⛔ '+stopLoss)
  +(targets.length?section('익절 기준', targets.map(function(t){return '• '+t;}).join('<br>')):'')
  +(d.note?row('참고', d.note):'')
  +'<div style="margin-top:16px;padding:14px;border-radius:8px;background:'+bgC+';border:1.5px solid '+color+';font-size:14px;font-weight:700;color:'+color+'">'
  +'🏁 최종 판단: '+finalJudge+'</div>'
  +'<div style="margin-top:8px;font-size:10px;color:#4b5563">⚠ 구조론 규칙 기반 시나리오입니다. 투자 결정은 반드시 본인이 최종 판단하세요.</div>'
  +'</div>';
}

// ── 통화 포맷 ──
function formatPrice(v, cur){
  if(!v || v===0) return '0';
  var c = cur || 'KRW';
  if(c==='USD') return '$'+(v<10 ? v.toFixed(4) : v<1000 ? v.toFixed(2) : v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
  if(c==='EUR') return '€'+v.toFixed(2);
  if(c==='GBP') return '£'+v.toFixed(2);
  if(c==='JPY') return '¥'+Math.round(v).toLocaleString();
  if(c==='CNY') return '¥'+v.toFixed(2);
  return Math.round(v).toLocaleString()+'원'; // KRW default
}

function row(label, value){
  return '<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
  +'<div style="min-width:120px;font-size:11px;color:#6b7280;font-weight:600;flex-shrink:0">'+label+'</div>'
  +'<div style="font-size:12px;color:var(--tx);line-height:1.65">'+value+'</div></div>';
}
function section(label, content){
  return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
  +'<div style="font-size:11px;color:#6b7280;font-weight:600;margin-bottom:4px">'+label+'</div>'
  +'<div style="font-size:12px;color:var(--tx);line-height:1.75">'+content+'</div></div>';
}

// ═══════════════════════
// ── 화면 빌더 ──
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
  +'.ct-g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
  +'.ct-g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}'
  +'.ct-btn{padding:12px 20px;background:var(--ac);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;width:100%;margin-top:8px}'
  +'.ct-btn:hover{opacity:.9}'
  +'.ct-box{background:var(--s2);border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid var(--bd)}'
  +'.ct-box-t{font-size:12px;font-weight:700;color:var(--tx);margin-bottom:10px}'
  +'.ct-card{background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:14px;margin-bottom:12px}'
  +'.ct-card-title{font-size:13px;font-weight:700;color:var(--tx);margin-bottom:8px}'
  +'.ct-card-body{font-size:12px;color:var(--mt);line-height:1.75}'
  +'.ct-step{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}'
  +'.ct-step-n{min-width:26px;height:26px;border-radius:50%;background:var(--ac);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
  +'.ct-step-c{font-size:12px;color:var(--mt)}'
  +'.ct-step-t{font-weight:700;color:var(--tx);font-size:12px;margin-bottom:2px}'
  +'.ct-sym-bar{display:flex;gap:8px;margin-bottom:12px}'
  +'.ct-sym-in{flex:1;padding:9px 12px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-size:13px}'
  +'.ct-sym-btn{padding:9px 16px;background:var(--ac);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600}'
  +'@media(max-width:640px){.ct-g2{grid-template-columns:1fr}.ct-g3{grid-template-columns:1fr 1fr}}'
  +'</style>';
}

function buildHero(){
  return '<div class="ct-hero">'
  +'<h2>📊 차트 분석</h2>'
  +'<p style="color:var(--mt);font-size:11px">종목 입력 → 자동 기술적 분석 | 체결→거래량→종가→사건봉→박스→도지→기능선→시나리오</p>'
  +'</div>';
}

function buildTabBar(){
  var tabs=[{id:'chart',label:'📈 차트 + 자동 분석'},{id:'analyze',label:'🔍 수동 분석'},{id:'theory',label:'📚 이론 가이드'}];
  return '<div class="ct-tab-bar">'
  +tabs.map(function(t){ return '<button class="ct-tab" data-t="'+t.id+'" onclick="window._ctSwitchTab(\''+t.id+'\')">'+t.label+'</button>'; }).join('')
  +'</div>';
}

function buildTabContent(){ return buildChartPane()+buildAnalyzePane()+buildTheoryPane(); }

// ── 차트 탭 ──
function buildChartPane(){
  return '<div class="ct-pane" data-pane="chart" style="display:none">'
  +'<div class="ct-sym-bar">'
  +'<input id="ct-sym-input" class="ct-sym-in" placeholder="종목코드 (005930, AAPL, BTCUSDT)" value="005930" onkeydown="if(event.key===\'Enter\')window._ctChangeSymbol()">'
  +'<select id="ct-int-select" class="ct-sym-in" style="max-width:90px">'
  +'<option value="5">5분</option><option value="15">15분</option><option value="60">1시간</option>'
  +'<option value="D" selected>일봉</option><option value="W">주봉</option><option value="M">월봉</option>'
  +'</select>'
  +'<button class="ct-sym-btn" onclick="window._ctChangeSymbol()">분석</button>'
  +'</div>'
  +'<div id="ct-tv-box" style="height:520px;border-radius:10px;overflow:hidden;border:1px solid var(--bd)"></div>'
  +'<div id="ct-auto-output"></div>'
  +'<div style="margin-top:8px;font-size:11px;color:#374151;text-align:center">Yahoo Finance 일봉 6개월 데이터 자동 분석 | 정밀 보정은 🔍 수동 분석 탭</div>'
  +'</div>';
}

// ── 수동 분석 탭 ──
function buildAnalyzePane(){
  return '<div class="ct-pane" data-pane="analyze" style="display:none">'
  +'<div style="background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.25);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:#60a5fa">'
  +'💡 차트 탭에서 자동 분석하면 이 폼에 값이 자동으로 채워집니다. 직접 수정 후 재분석 가능.'
  +'</div>'
  +'<div class="ct-box"><div class="ct-box-t">📋 기본 정보</div>'
  +'<div class="ct-g2">'
  +'<div class="ct-form-row"><div class="ct-label">현재 구조 *</div><select id="ct-structure" class="ct-input">'
  +'<option value="box">📦 박스 구간</option><option value="trend-up">📈 상승 추세</option><option value="trend-down">📉 하락 추세</option>'
  +'</select></div>'
  +'<div class="ct-form-row"><div class="ct-label">통화</div><select id="ct-currency" class="ct-input">'
  +'<option value="KRW" selected>🇰🇷 원화 (KRW)</option>'
  +'<option value="USD">🇺🇸 달러 (USD)</option>'
  +'<option value="JPY">🇯🇵 엔화 (JPY)</option>'
  +'<option value="EUR">🇪🇺 유로 (EUR)</option>'
  +'</select></div>'
  +'</div>'
  +'<div class="ct-g2">'
  +'<div class="ct-form-row"><div class="ct-label">기능선 格 (프레임)</div><select id="ct-frame" class="ct-input">'
  +'<option value="daily" selected>B급 — 일봉</option><option value="weekly">A급 — 주봉</option>'
  +'<option value="monthly">S급 — 월봉</option><option value="h4">C급 — 4시간</option><option value="h1">C급 — 1시간</option>'
  +'</select></div>'
  +'</div>'
  +'<div class="ct-form-row"><div class="ct-label">현재 가격 *</div><input id="ct-price" class="ct-input" type="number" placeholder="현재 가격"></div>'
  +'</div>'
  +'<div class="ct-box"><div class="ct-box-t">📦 박스 경계</div><div class="ct-g3">'
  +'<div class="ct-form-row"><div class="ct-label">박스 상단 (저항)</div><input id="ct-box-upper" class="ct-input" type="number" placeholder="박스 상단"></div>'
  +'<div class="ct-form-row"><div class="ct-label">종가 클러스터 (균형)</div><input id="ct-box-close" class="ct-input" type="number" placeholder="생략시 중간값 자동"></div>'
  +'<div class="ct-form-row"><div class="ct-label">박스 하단 (지지)</div><input id="ct-box-lower" class="ct-input" type="number" placeholder="박스 하단"></div>'
  +'</div></div>'
  +'<div class="ct-box"><div class="ct-box-t">🕯 도지 경계</div><div class="ct-g3">'
  +'<div class="ct-form-row"><div class="ct-label">도지 상단</div><input id="ct-doji-upper" class="ct-input" type="number" placeholder="도지 상단"></div>'
  +'<div class="ct-form-row"><div class="ct-label">도지 종가 (합의가격)</div><input id="ct-doji-close" class="ct-input" type="number" placeholder="도지 종가"></div>'
  +'<div class="ct-form-row"><div class="ct-label">도지 하단</div><input id="ct-doji-lower" class="ct-input" type="number" placeholder="도지 하단"></div>'
  +'</div>'
  +'<div class="ct-form-row"><div class="ct-label">도지 타입</div><select id="ct-doji-type" class="ct-input">'
  +'<option value="none">없음</option><option value="strength">추세강화도지</option><option value="reversal">추세반전도지</option>'
  +'</select></div></div>'
  +'<div class="ct-box"><div class="ct-box-t">⚡ 사건봉 & 거래량</div>'
  +'<div class="ct-form-row"><div class="ct-label">사건봉 종가</div><input id="ct-event-close" class="ct-input" type="number" placeholder="고거래량 봉 종가"></div>'
  +'<div class="ct-g2">'
  +'<div class="ct-form-row"><div class="ct-label">거래량 수준</div><select id="ct-vol" class="ct-input">'
  +'<option value="high">📈 급증 (2배+)</option><option value="normal" selected>📊 보통</option><option value="low">📉 감소</option>'
  +'</select></div>'
  +'<div class="ct-form-row"><div class="ct-label">현재 동작</div><select id="ct-vol-context" class="ct-input">'
  +'<option value="none" selected>일반</option><option value="breakout">🔼 돌파 중</option><option value="pullback">🔽 눌림 중</option>'
  +'<option value="breakdown">⬇ 이탈 중</option><option value="bounce">⬆ 반등 중</option>'
  +'</select></div></div></div>'
  +'<div class="ct-box"><div class="ct-box-t">🔲 갭 & 리테스트</div><div class="ct-g2">'
  +'<div class="ct-form-row"><div class="ct-label">갭 상황</div><select id="ct-gap" class="ct-input">'
  +'<option value="none" selected>갭 없음</option><option value="up-above">⬆ 상승갭(저항 위)</option>'
  +'<option value="up-below">↗ 상승갭(저항 아래)</option><option value="down-below">⬇ 하락갭(지지 아래)</option>'
  +'<option value="down-above">↘ 하락갭(지지 위)</option>'
  +'</select></div>'
  +'<div class="ct-form-row"><div class="ct-label">리테스트 상태</div><select id="ct-retest" class="ct-input">'
  +'<option value="pending" selected>아직 대기 중</option><option value="done">완료 — 지지/저항 확인</option><option value="failed">실패 — 돌파/이탈됨</option>'
  +'</select></div></div></div>'
  +'<div class="ct-form-row"><div class="ct-label">참고 사항</div>'
  +'<textarea id="ct-note" class="ct-input" rows="2" placeholder="뉴스, 특이사항 등"></textarea></div>'
  +'<button class="ct-btn" onclick="window._ctAnalyze()">📊 차트 분석 실행</button>'
  +'<div id="ct-output"></div>'
  +'</div>';
}

// ── 이론 가이드 탭 ──
function buildTheoryPane(){
  var steps=[
    {n:1,t:'체결',d:'시장의 실제 행동 — 체결이 쌓여 거래량이 된다.'},
    {n:2,t:'거래량',d:'자금 흔적. 돌파+급증=신뢰, 눌림+감소=진입적기, 이탈+급증=신뢰, 반등+감소=매도적기.'},
    {n:3,t:'종가',d:'시장 최종 합의. 장중 고/저가는 흔적. 모든 판단은 종가 기준.'},
    {n:4,t:'사건봉 종가',d:'대량거래 봉 종가 = 시장이 미래 참조. 꼬리가 아닌 종가가 핵심.'},
    {n:5,t:'박스',d:'합의 구간. 상단=저항, 하단=지지. 박스 안=박스매매, 밖=추세매매.'},
    {n:6,t:'도지',d:'압축된 박스. 하위 프레임 횡보 → 상위 도지. 도지 상단/종가/하단으로 내부/외부 시점 분리.'},
    {n:7,t:'기능선',d:'실제 기능 수행 후 인정. 반복할수록 格 상승. S(월)>A(주)>B(일)>C(단기).'},
    {n:8,t:'지지·저항 전환',d:'저항 종가 돌파→지지. 지지 종가 이탈→저항. 스위치 원리. 리테스트로 확인.'},
    {n:9,t:'박스/추세매매',d:'박스 안: 하단매수·상단매도. 상방이탈: 눌림매매. 하방이탈: 되돌림매도.'},
    {n:10,t:'진입·손절·익절',d:'진입 근거 상실 즉시 손절. 새 이유 붙이기 금지. 익절=다음 기능선.'}
  ];
  var gapCases=[
    {s:'상승갭 — 저항 위',r:'저항 돌파 → 지지전환 가능 → 눌림 대기'},
    {s:'상승갭 — 저항 아래',r:'저항 미돌파 → 기존 저항 유지 → 관찰'},
    {s:'하락갭 — 지지 아래',r:'지지 이탈 → 저항전환 가능 → 반등 매도 대기'},
    {s:'하락갭 — 지지 위',r:'지지 미이탈 → 기존 지지 유지 → 관찰'}
  ];
  var grades=[
    {g:'S급',f:'월봉',d:'월봉 도지·사건봉·대형 박스',c:'#f59e0b'},
    {g:'A급',f:'주봉',d:'주봉 도지·사건봉·박스',c:'#c084fc'},
    {g:'B급',f:'일봉',d:'일봉 도지·사건봉·박스',c:'#60a5fa'},
    {g:'C급',f:'단기',d:'4시간·1시간 — 참고용',c:'#6b7280'}
  ];
  var strengths=['1순위: 거래량 — 클수록 강하다','2순위: 체류시간 — 오래 머문 구간일수록','3순위: 돌파 후 이동거리 — 이후 추세가 클수록','4순위: 반복 기능 — 반복 수행할수록','5순위: 프레임 — 월봉>주봉>일봉 우선'];
  var removals=['단순 스윙 저점/고점','거래량 없는 조정 저점·반등 고점','현재가와 가깝다는 이유만으로 선택','이동평균선·피보·라운드넘버만 근거','돌파 후 강한 이동 없었던 도지','최근이라는 이유만으로 선택한 저/고점'];
  var rules=['종가 기준이 아닌 장중 돌파로 판단하지 않는다.','도지 모양만 보고 매수/매도 결론 내리지 않는다.','박스와 추세를 구분하지 않고 분석하지 않는다.','사건봉 꼬리 끝만 보고 핵심 가격 정하지 않는다.','거래량 없는 돌파를 신뢰도 높게 평가하지 않는다.','기능선 사라졌는데 새 이유 붙여 보유하지 않는다.','갭 자체만 보고 의미 부여하지 않는다.','손절 기준 없이 가능성만 말하지 않는다.','현재가 가깝다는 이유로 지지/저항 선택하지 않는다.'];

  return '<div class="ct-pane" data-pane="theory" style="display:none">'
  +'<div class="ct-card"><div class="ct-card-title">📊 차트 분석 핵심 흐름</div>'
  +steps.map(function(s){ return '<div class="ct-step"><div class="ct-step-n">'+s.n+'</div><div class="ct-step-c"><div class="ct-step-t">'+s.t+'</div>'+s.d+'</div></div>'; }).join('')
  +'</div>'
  +'<div class="ct-card"><div class="ct-card-title">🕯 도지의 종류</div><div class="ct-card-body">'
  +'<div style="margin-bottom:10px"><strong style="color:var(--tx)">추세강화도지</strong><br>추세 중간 에너지 재충전. 상승추세강화도지 = 조정 시 지지후보. 하락추세강화도지 = 반등 시 저항후보.</div>'
  +'<div><strong style="color:var(--tx)">추세반전도지</strong><br>추세 전환 기준점. 재침범 시 새 추세 자체가 훼손 신호.</div>'
  +'</div></div>'
  +'<div class="ct-card"><div class="ct-card-title">🏆 기능선 格 체계</div><div class="ct-card-body">'
  +grades.map(function(g){ return '<div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="min-width:38px;font-weight:700;color:'+g.c+'">'+g.g+'</div><div><b style="color:var(--tx)">'+g.f+'</b> — '+g.d+'</div></div>'; }).join('')
  +'</div></div>'
  +'<div class="ct-card"><div class="ct-card-title">⚡ 전장 강도 평가 5순위</div><div class="ct-card-body">'+strengths.map(function(s){return '• '+s+'<br>';}).join('')+'</div></div>'
  +'<div class="ct-card"><div class="ct-card-title">🗑 후보 제거 규칙</div><div class="ct-card-body">'+removals.map(function(r){return '• <s>'+r+'</s><br>';}).join('')+'</div></div>'
  +'<div class="ct-card"><div class="ct-card-title">🔲 갭 해석 4케이스</div><div class="ct-card-body">'
  +gapCases.map(function(g){ return '<div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)"><b style="color:var(--tx)">'+g.s+'</b><br>→ '+g.r+'</div>'; }).join('')
  +'</div></div>'
  +'<div class="ct-card"><div class="ct-card-title">🎯 핵심 공식</div><div class="ct-card-body">'
  +'<b style="color:var(--tx)">박스 안</b> → 박스매매 (하단 매수·상단 매도)<br>'
  +'<b style="color:var(--tx)">박스 밖 상방</b> → 눌림매매 (저항→지지 리테스트 확인)<br>'
  +'<b style="color:var(--tx)">박스 밖 하방</b> → 되돌림 매도 (지지→저항 리테스트 확인)<br>'
  +'<b style="color:var(--tx)">근거 상실</b> → 즉시 손절. 새 이유 금지<br><br>'
  +'<b style="color:#06b6d4">공포에 매수</b> = 저항 돌파 종목의 되돌림 공포에 매수<br>'
  +'<b style="color:#a855f7">안도에 매도</b> = 지지 이탈 종목의 반등 안도감에 매도'
  +'</div></div>'
  +'<div class="ct-card"><div class="ct-card-title">⛔ 절대 금지 규칙</div><div class="ct-card-body">'+rules.map(function(r){return '• '+r+'<br>';}).join('')+'</div></div>'
  +'<div style="font-size:11px;color:#374151;text-align:center;padding-bottom:8px">차트 분석 — 차트는 미래 예언이 아닌 시장 참여자들의 합의 역사책이다</div>'
  +'</div>';
}

})();
