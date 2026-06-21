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
  window._ctSwitchTab('chart');
  // 기본 종목 자동 분석 실행
  setTimeout(function(){
    window._ctAutoFill(_ctSymbol);
    window._ctAutoAnalyze(_ctSymbol);
  }, 600);
};

// ══════════════════════════════════════
// ── 분석 저장 시스템 (localStorage) ──
// ══════════════════════════════════════

// 분석 저장
window._ctSaveAnalysis = function(){
  var sym = (document.getElementById('ct-sym-input')||{}).value || '—';
  var e1 = parseFloat((document.getElementById('ct-c-price')||document.getElementById('ct-price')||{}).value)||0;
  var upper = parseFloat((document.getElementById('ct-c-upper')||document.getElementById('ct-box-upper')||{}).value)||0;
  var lower = parseFloat((document.getElementById('ct-c-lower')||document.getElementById('ct-box-lower')||{}).value)||0;
  var struct = (document.getElementById('ct-c-struct')||document.getElementById('ct-structure')||{}).value||'box';

  // 마지막 분석 결과에서 가격 추출
  var out = document.getElementById('ct-auto-output');
  var e1pEl = out ? out.querySelector('[data-e1p]') : null;

  var rec = {
    id: Date.now(),
    date: new Date().toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}),
    time: new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}),
    sym: sym.replace(/^KRX:/,''),
    price: e1,
    upper: upper, lower: lower,
    struct: struct==='trend-up'?'상승':struct==='trend-down'?'하락':'박스',
    result: '', memo: ''
  };

  var hist = JSON.parse(localStorage.getItem('ct_hist')||'[]');
  hist.unshift(rec);
  hist = hist.slice(0,100);
  localStorage.setItem('ct_hist', JSON.stringify(hist));

  // 버튼 피드백
  var btn = document.getElementById('ct-save-btn');
  if(btn){ btn.textContent='✅ 저장됨'; setTimeout(function(){btn.textContent='💾 분석 저장';},2000); }
};

// 분석 결과 업데이트 (result 필드)
window._ctUpdateResult = function(id, result){
  var hist = JSON.parse(localStorage.getItem('ct_hist')||'[]');
  var rec = hist.find(function(h){return h.id===id;});
  if(rec){ rec.result=result; localStorage.setItem('ct_hist',JSON.stringify(hist)); renderHistory(); }
};

// 기록 삭제
window._ctDeleteHistory = function(id){
  var hist = JSON.parse(localStorage.getItem('ct_hist')||'[]').filter(function(h){return h.id!==id;});
  localStorage.setItem('ct_hist', JSON.stringify(hist));
  renderHistory();
};

// 기록 렌더링
function renderHistory(){
  var el = document.getElementById('ct-hist-body');
  if(!el) return;
  var hist = JSON.parse(localStorage.getItem('ct_hist')||'[]');
  if(!hist.length){ el.innerHTML='<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:20px">저장된 분석이 없습니다. 분석 후 저장 버튼을 누르세요.</td></tr>'; return; }
  el.innerHTML = hist.map(function(h){
    var rC = h.result==='성공'?'#22c55e':h.result==='실패'?'#ef4444':'#6b7280';
    return '<tr>'
      +'<td>'+h.date+' '+h.time+'</td>'
      +'<td><b>'+h.sym+'</b></td>'
      +'<td>'+(h.price?h.price.toLocaleString():'—')+'</td>'
      +'<td style="font-size:11px;color:#9ca3af">'+(h.lower?h.lower.toLocaleString():'—')+' ~ '+(h.upper?h.upper.toLocaleString():'—')+'</td>'
      +'<td><span style="font-size:11px;padding:2px 6px;background:var(--s2);border-radius:4px">'+h.struct+'</span></td>'
      +'<td><select onchange="window._ctUpdateResult('+h.id+',this.value)" style="background:transparent;border:1px solid var(--bd);border-radius:4px;color:'+rC+';font-size:11px;padding:2px 4px">'
        +'<option value="" '+(h.result===''?'selected':'')+'>미확인</option>'
        +'<option value="성공" '+(h.result==='성공'?'selected':'')+'>✅ 성공</option>'
        +'<option value="실패" '+(h.result==='실패'?'selected':'')+'>❌ 실패</option>'
        +'<option value="보유중" '+(h.result==='보유중'?'selected':'')+'>📊 보유중</option>'
      +'</select></td>'
      +'<td><button onclick="window._ctDeleteHistory('+h.id+')" style="background:none;border:none;color:#4b5563;cursor:pointer;font-size:12px">🗑</button></td>'
    +'</tr>';
  }).join('');
}

// ── 매매 계산기 ──
window._ctCalcPosition = function(){
  var account = parseFloat((document.getElementById('ct-account')||{}).value)||0;
  var pct = parseFloat((document.getElementById('ct-pos-pct')||{}).value)||100;
  var entry = parseFloat((document.getElementById('ct-calc-entry')||{}).value)||0;
  var stop = parseFloat((document.getElementById('ct-calc-stop')||{}).value)||0;
  var target = parseFloat((document.getElementById('ct-calc-target')||{}).value)||0;
  var cur = (document.getElementById('ct-c-currency')||document.getElementById('ct-currency')||{}).value||'KRW';
  var res = document.getElementById('ct-calc-result');
  if(!res) return;

  if(!account||!entry){ res.innerHTML='<span style="color:#6b7280">계좌 크기와 진입가를 입력하세요</span>'; return; }

  var investAmt = Math.round(account * pct / 100);
  var shares = entry>0 ? Math.floor(investAmt/entry) : 0;
  var actualInvest = shares * entry;
  var riskAmt = stop>0&&shares>0 ? Math.round(shares * Math.abs(entry-stop)) : 0;
  var profitAmt = target>0&&shares>0 ? Math.round(shares * Math.abs(target-entry)) : 0;
  var riskPct = account>0 ? Math.round(riskAmt/account*100*10)/10 : 0;
  var fp2 = function(v){ return cur==='USD'?'$'+(v/1).toLocaleString('en-US',{minimumFractionDigits:0}):v.toLocaleString()+'원'; };

  res.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
    +'<div style="padding:10px;background:var(--s2);border-radius:8px"><div style="font-size:10px;color:#6b7280">투자금액</div><div style="font-size:16px;font-weight:800;color:var(--tx)">'+fp2(actualInvest)+'</div><div style="font-size:10px;color:#6b7280">계좌의 '+pct+'%</div></div>'
    +'<div style="padding:10px;background:var(--s2);border-radius:8px"><div style="font-size:10px;color:#6b7280">매수 수량</div><div style="font-size:16px;font-weight:800;color:var(--tx)">'+shares.toLocaleString()+'주</div><div style="font-size:10px;color:#6b7280">@ '+fp2(entry)+'</div></div>'
    +(stop?'<div style="padding:10px;background:rgba(239,68,68,.08);border-radius:8px;border:1px solid rgba(239,68,68,.2)"><div style="font-size:10px;color:#ef4444">최대 손실</div><div style="font-size:16px;font-weight:800;color:#ef4444">'+fp2(riskAmt)+'</div><div style="font-size:10px;color:#6b7280">계좌의 '+riskPct+'%</div></div>':'')
    +(target&&stop?'<div style="padding:10px;background:rgba(34,197,94,.08);border-radius:8px;border:1px solid rgba(34,197,94,.2)"><div style="font-size:10px;color:#22c55e">예상 수익</div><div style="font-size:16px;font-weight:800;color:#22c55e">'+fp2(profitAmt)+'</div><div style="font-size:10px;color:#6b7280">R:R 1:'+Math.round(profitAmt/(riskAmt||1)*10)/10+'</div></div>':'')
    +'</div>'
    +(riskPct>5?'<div style="margin-top:8px;padding:8px 10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px;font-size:11px;color:#ef4444">⚠ 최대 손실이 계좌의 '+riskPct+'%입니다. 통상 1~2% 이하 권장.</div>':'');
};

// ── 탭 전환 ──
window._ctSwitchTab = function(id){
  _ctTab = id;
  document.querySelectorAll('.ct-tab').forEach(function(b){ b.classList.toggle('on', b.dataset.t===id); });
  document.querySelectorAll('.ct-pane').forEach(function(c){ c.style.display = c.dataset.pane===id ? 'block' : 'none'; });
  if(id==='chart' && !_tvLoaded){ setTimeout(initTV, 250); _tvLoaded=true; }
  if(id==='history'){ setTimeout(renderHistory, 50); }
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
  // 폼 자동 채우기 시도 + 자동 분석 실행
  window._ctAutoFill(sym);
  window._ctAutoAnalyze(sym);
};

// ══════════════════════════════════════
// ── TradingView 데이터 자동 입력 ──
// ══════════════════════════════════════

// TV 심볼 변환
function toTVSym(sym){
  var raw=sym.toUpperCase().replace(/^(KRX|KRSE):/,'').replace(/\.(KS|KQ)$/,'');
  return /^\d{4,6}$/.test(raw)?'KRX:'+raw:raw;
}

// 1) TradingView Quotes API (현재가·고저·52주 고저)
//    - TradingView 위젯이 직접 사용하는 API → CORS *
async function tvQuotes(sym){
  var tvSym=toTVSym(sym);
  try{
    var ctrl=new AbortController(), t=setTimeout(function(){ctrl.abort();},6000);
    var r=await fetch('https://quotes.tradingview.com/quotes/?symbols='+encodeURIComponent(tvSym),{signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok) return null;
    var d=await r.json();
    var v=d&&d.p&&d.p[0]&&d.p[0].s==='ok'?d.p[0].v:null;
    if(!v||!v.lp) return null;
    return {
      price:   v.lp,
      high:    v.high_price,
      low:     v.low_price,
      open:    v.open_price,
      vol:     v.volume,
      w52h:    v.week52_high,
      w52l:    v.week52_low,
      chp:     v.chp,
      name:    v.short_name||tvSym,
      currency:v.currency_code||(/^\d{4,6}$/.test(sym.replace(/^(KRX|KRSE):/,'').replace(/\.(KS|KQ)$/,''))?'KRW':'USD')
    };
  }catch(_){return null;}
}

// 2) TradingView Scanner (SMA·RSI·MACD·1개월 고저)
//    - TV 스크리너 웹앱이 사용하는 API
async function tvScan(sym){
  var tvSym=toTVSym(sym);
  var isKR=/^\d{4,6}$/.test(tvSym.replace('KRX:',''));
  var url='https://scanner.tradingview.com/'+(isKR?'korea':'america')+'/scan';
  var cols=['close','open','high','low','volume','change',
    'SMA5','SMA20','SMA50','SMA100',
    'RSI','RSI[1]','RSI[2]',
    'MACD.macd','MACD.signal','MACD.hist',
    'BB.upper','BB.middle','BB.lower',
    'High.1M','Low.1M','High.3M','Low.3M',
    'average_volume_10d_calc','Recommend.All'];
  try{
    var ctrl=new AbortController(), t=setTimeout(function(){ctrl.abort();},6000);
    var r=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({symbols:{tickers:[tvSym],query:{types:[]}},columns:cols}),
      signal:ctrl.signal
    });
    clearTimeout(t);
    if(!r.ok) return null;
    var d=await r.json();
    if(!d.data||!d.data[0]) return null;
    var vals=d.data[0].d, res={};
    cols.forEach(function(c,i){res[c]=vals[i];});
    return res;
  }catch(_){return null;}
}

// 자동 폼 채우기
window._ctAutoFill = async function(sym){
  // 입력 폼에 로딩 표시
  var statusEl = document.getElementById('ct-fill-status');
  if(statusEl) statusEl.textContent = '⏳ 데이터 로딩 중...';

  var q=null, s=null;

  // 병렬로 Quotes + Scanner 동시 시도
  var results = await Promise.allSettled([tvQuotes(sym), tvScan(sym)]);
  if(results[0].status==='fulfilled') q=results[0].value;
  if(results[1].status==='fulfilled') s=results[1].value;

  if(!q && !s){
    // API 실패 시 → 차트 읽는 방법 가이드 표시
    if(statusEl){
      statusEl.innerHTML = '<div style="font-size:12px;color:var(--tx);line-height:1.8">'
        +'<b style="color:#f59e0b">📊 TradingView 차트에서 직접 읽어서 입력하세요</b><br>'
        +'<span style="color:#6b7280">① 현재가</span> — 차트 오른쪽 끝 마지막 봉의 <b>종가(닫힌 봉)</b><br>'
        +'<span style="color:#ef4444">② 저항(박스 상단)</span> — 여러 번 막힌 <b>고점 가격대</b><br>'
        +'<span style="color:#22c55e">③ 지지(박스 하단)</span> — 여러 번 지지된 <b>저점 가격대</b><br>'
        +'<span style="color:#60a5fa">④ 추세</span> — SMA20이 SMA60 <b>위</b>=상승 / <b>아래</b>=하락 / 비슷=박스'
        +'</div>';
    }
    return;
  }

  var price  = q?q.price:(s&&s.close)||0;
  var currency= q?q.currency:'KRW';
  var sma20  = s&&s.SMA20  ? Math.round(s.SMA20)  : null;
  var sma60  = s&&s.SMA50  ? Math.round(s.SMA50)  : null;
  var rsi    = s&&s.RSI    ? Math.round(s.RSI*10)/10 : null;
  var machV  = s&&s['MACD.hist'] ? Math.round(s['MACD.hist']*100)/100 : null;

  // 저항 = 1개월 고점 > 오늘 고점 > 52주 고점
  var upper  = (s&&s['High.1M']) || (q&&q.high) || (q&&q.w52h) || 0;
  // 지지   = 1개월 저점 > 오늘 저점 > 52주 저점
  var lower  = (s&&s['Low.1M'])  || (q&&q.low)  || (q&&q.w52l) || 0;

  // 추세 자동 판단
  var struct = 'box';
  if(sma20&&sma60){
    if(price>sma20&&sma20>sma60) struct='trend-up';
    else if(price<sma20&&sma20<sma60) struct='trend-down';
  } else if(q&&q.w52h&&q.w52l){
    var pos=(price-q.w52l)/(q.w52h-q.w52l);
    if(pos>0.7) struct='trend-up';
    else if(pos<0.3) struct='trend-down';
  }

  // 폼 채우기
  function setV(id,v){ var el=document.getElementById(id); if(el&&v) el.value=v; }
  setV('ct-c-price',   Math.round(price*100)/100);
  setV('ct-c-upper',   Math.round(upper));
  setV('ct-c-lower',   Math.round(lower));
  setV('ct-c-rsi',     rsi);
  setV('ct-c-macdh',   machV);
  setV('ct-c-sma20',   sma20);
  setV('ct-c-sma60',   sma60);
  var se=document.getElementById('ct-c-struct'); if(se) se.value=struct;
  var ce=document.getElementById('ct-c-currency'); if(ce) ce.value=currency;

  if(statusEl){
    var src = (q?'Quotes':'')+(s?' + Scanner':'');
    statusEl.textContent = '✅ 자동 입력 완료 ('+src+') — 확인 후 분석 실행 클릭';
    statusEl.style.color='#22c55e';
  }
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

// Yahoo Finance 데이터 페치
// 1순위: 자체 Cloudflare Worker (/api/quote) — 서버 측 직접 호출, CORS 없음
// 2순위: 외부 CORS 프록시 5개 병렬 fallback
async function fetchYahoo(ticker){
  // ── 1순위: 자체 Cloudflare Pages Function ──
  var workerResult = await _tryFetch('/api/quote?symbol='+encodeURIComponent(ticker), 12000);
  if(workerResult.ok) return {data:workerResult.ok, errors:[]};

  // ── 2순위: 외부 CORS 프록시 병렬 시도 ──
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
  var lastErrors = ['worker:'+workerResult.error];
  for(var yi=0; yi<yUrls.length; yi++){
    var u = yUrls[yi];
    var r = await _raceSuccess(mkProxy.map(function(mk){ return _tryFetch(mk(u), 12000); }));
    if(r.ok) return {data:r.ok, errors:[]};
    lastErrors = lastErrors.concat(r.errors||[]);
  }
  return {data:null, errors:lastErrors};
}

// ══════════════════════════════════════
// ── TradingView 스캐너 API (한국·미국 주식, CORS 허용) ──
// RSI/MACD/BB/SMA 등 이미 계산된 지표 + 현재가 반환
// ══════════════════════════════════════
async function fetchTradingViewScan(symbol){
  var raw = symbol.toUpperCase().replace(/^(KRX|KRSE):/,'').replace(/\.(KS|KQ)$/,'');
  var isKR = /^\d{4,6}$/.test(raw);
  var tvSym = isKR ? 'KRX:'+raw : raw;
  var scanUrl = isKR
    ? 'https://scanner.tradingview.com/korea/scan'
    : 'https://scanner.tradingview.com/america/scan';
  var currency = isKR ? 'KRW' : 'USD';

  var cols = [
    'close','open','high','low','volume','change',
    'RSI','RSI[1]','RSI[2]',
    'MACD.macd','MACD.signal','MACD.hist',
    'BB.upper','BB.middle','BB.lower',
    'SMA5','SMA10','SMA20','SMA50','SMA100','SMA200',
    'EMA20','EMA50',
    'High.1M','Low.1M','High.3M','Low.3M',
    'average_volume_10d_calc','average_volume_30d_calc',
    'Recommend.All','Recommend.MA','Recommend.Other',
    'name','description',
  ];

  var ctrl = new AbortController();
  var timer = setTimeout(function(){ ctrl.abort(); }, 8000);
  try {
    var resp = await fetch(scanUrl, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        symbols: {tickers:[tvSym], query:{types:[]}},
        columns: cols
      }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if(!resp.ok) return null;
    var json = await resp.json();
    if(!json.data || !json.data[0]) return null;
    var vals = json.data[0].d;
    var r = {};
    cols.forEach(function(c,i){ r[c]=vals[i]; });
    if(!r.close) return null;

    return { r:r, currency:currency, tvSym:tvSym,
      name: r.description || r.name || tvSym };
  } catch(_){ clearTimeout(timer); return null; }
}

// TradingView 스캐너 데이터로 차트 패턴 감지
function tvDetectPatterns(r, cur){
  var pts = [];
  var h1=r['High.1M']||0, l1=r['Low.1M']||0;
  var h3=r['High.3M']||0, l3=r['Low.3M']||0;
  var bb=r['BB.upper']&&r['BB.lower']?{u:r['BB.upper'],l:r['BB.lower'],m:r['BB.middle']||r['SMA20']||0}:null;
  var rsi=r.RSI, rsi1=r['RSI[1]'], rsi2=r['RSI[2]'];

  // 1. 볼린저 밴드 스퀴즈 (수렴)
  if(bb&&bb.m){
    var bw=(bb.u-bb.l)/bb.m*100;
    if(bw<5) pts.push({name:'볼린저 극도 수렴 (Tight Squeeze)',desc:'밴드 폭 '+Math.round(bw)+'% — 큰 방향성 이탈 임박. 이탈 방향이 다음 추세 결정.',type:'neutral'});
    else if(bw<10) pts.push({name:'볼린저 수렴 (BB Squeeze)',desc:'밴드 폭 '+Math.round(bw)+'% 수렴 — 에너지 압축 중. 돌파 방향 주목.',type:'neutral'});
  }

  // 2. 1개월 고점·저점 근접 (지지/저항 테스트)
  if(h1&&cur>=h1*0.98) pts.push({name:'1개월 고점 저항 테스트 (Monthly High)',desc:'현재가('+Math.round(cur)+')가 1개월 고점('+Math.round(h1)+') 근접. 돌파 시 강한 상승, 저항 시 조정.',type:'neutral'});
  if(l1&&cur<=l1*1.02) pts.push({name:'1개월 저점 지지 테스트 (Monthly Low)',desc:'현재가('+Math.round(cur)+')가 1개월 저점('+Math.round(l1)+') 근접. 지지 시 반등, 이탈 시 추가 하락.',type:'neutral'});

  // 3. 추세 비교 (1개월 vs 3개월 고점·저점)
  if(h1&&h3&&l1&&l3){
    if(h1>h3*0.97&&l1>l3*0.97) pts.push({name:'단기 상승 추세 (Higher High·Higher Low)',desc:'1개월 고점·저점이 3개월 대비 높아짐 → 상승 추세 진행 중. 눌림 시 매수 유효.',type:'bullish'});
    if(h1<h3*0.97&&l1<l3*0.97) pts.push({name:'단기 하락 추세 (Lower High·Lower Low)',desc:'1개월 고점·저점이 3개월 대비 낮아짐 → 하락 추세 진행 중. 반등 시 신중 접근.',type:'bearish'});
  }

  // 4. RSI 다이버전스 (3개의 RSI 값으로 추론)
  if(rsi!==null&&rsi1!==null&&rsi2!==null){
    var rsiRising = rsi>rsi1&&rsi1>rsi2;    // RSI 지속 상승
    var rsiFalling = rsi<rsi1&&rsi1<rsi2;   // RSI 지속 하락
    if(rsiRising&&cur<(h1||cur)*0.97) pts.push({name:'RSI 강세 다이버전스 추정 (Bullish Divergence)',desc:'RSI('+Math.round(rsi*10)/10+'>'+Math.round(rsi1*10)/10+'>'+Math.round(rsi2*10)/10+') 3봉 연속 상승 + 가격 저점권 → 상승 반전 가능성.',type:'bullish'});
    if(rsiFalling&&cur>(l1||0)*1.02) pts.push({name:'RSI 약세 다이버전스 추정 (Bearish Divergence)',desc:'RSI('+Math.round(rsi*10)/10+'<'+Math.round(rsi1*10)/10+'<'+Math.round(rsi2*10)/10+') 3봉 연속 하락 + 가격 고점권 → 하락 반전 가능성.',type:'bearish'});
  }

  // 5. MACD 크로스 (현재 히스토그램 + 이전 상태 추론)
  var macdH=r['MACD.hist'], macdM=r['MACD.macd'], macdS=r['MACD.signal'];
  if(macdH!==null&&macdM!==null&&macdS!==null){
    if(macdH>0&&macdM<0) pts.push({name:'MACD 데드크로스 후 히스토그램 반전',desc:'MACD 라인 음권이나 히스토그램 플러스 전환 → 하락 모멘텀 약화, 반전 준비 신호.',type:'bullish'});
    if(macdH<0&&macdM>0) pts.push({name:'MACD 골든크로스 후 히스토그램 꺾임',desc:'MACD 라인 양권이나 히스토그램 마이너스 → 상승 모멘텀 약화, 조정 신호.',type:'bearish'});
  }

  // 6. TradingView 종합 추천 기반
  var rec=r['Recommend.All'];
  if(rec!==null&&rec!==undefined){
    if(rec>=0.5) pts.push({name:'TradingView 강한 매수 추천 (Strong Buy)',desc:'TradingView 기술적 지표 종합 점수 '+Math.round(rec*100)/100+' (Strong Buy). 다수 지표 매수 신호.',type:'bullish'});
    else if(rec>=0.1) pts.push({name:'TradingView 매수 추천 (Buy)',desc:'TradingView 기술적 지표 종합 점수 '+Math.round(rec*100)/100+' (Buy).',type:'bullish'});
    else if(rec<=-0.5) pts.push({name:'TradingView 강한 매도 추천 (Strong Sell)',desc:'TradingView 기술적 지표 종합 점수 '+Math.round(rec*100)/100+' (Strong Sell).',type:'bearish'});
    else if(rec<=-0.1) pts.push({name:'TradingView 매도 추천 (Sell)',desc:'TradingView 기술적 지표 종합 점수 '+Math.round(rec*100)/100+' (Sell).',type:'bearish'});
  }

  return pts;
}

// TradingView 스캔 결과 → 분석 데이터로 변환
function tvScanToAnalysis(tv){
  var r = tv.r;
  var cur = r.close;
  var bu = r['High.1M']||0, bl = r['Low.1M']||0;
  var bc = r['BB.middle']||Math.round((bu+bl)/2)||0;
  var s20=r.SMA20||0, s50=r.SMA50||0;
  var structure = (cur>s20&&s20>s50)?'trend-up':(cur<s20&&s20<s50)?'trend-down':'box';
  var avgVol = r['average_volume_10d_calc']||0;
  var curVol  = r.volume||0;
  var volLevel = curVol>avgVol*1.8?'high':curVol<avgVol*0.6?'low':'normal';
  var volCtx   = cur>(bu*0.99)?'breakout':cur<(bl*1.01)?'breakdown':(r.change>0)?'bounce':'pullback';

  // MACD 크로스 감지
  var macdCross = null;
  var mH=r['MACD.hist'], mM=r['MACD.macd'], mS=r['MACD.signal'];
  if(mM!==null&&mS!==null){
    if(mM>mS&&mM-mS<Math.abs(mM)*0.2) macdCross='golden'; // 골든크로스 직후 추정
    else if(mM<mS&&mS-mM<Math.abs(mS)*0.2) macdCross='dead';
  }

  // RSI 다이버전스 추정
  var rsiDiv=null, rsi=r['RSI'], rsi1=r['RSI[1]'], rsi2=r['RSI[2]'];
  if(rsi!==null&&rsi1!==null&&rsi2!==null){
    if(rsi>rsi1&&rsi1>rsi2&&cur<(bl||cur)*1.05) rsiDiv='bullish';
    if(rsi<rsi1&&rsi1<rsi2&&cur>(bu||cur)*0.95) rsiDiv='bearish';
  }

  // 차트 패턴 감지
  var patterns = tvDetectPatterns(r, cur);

  // 이격도
  var devs={};
  if(s20&&cur) devs.s20=(cur-s20)/s20*100;
  if(s50&&cur) devs.s60=(cur-s50)/s50*100;

  return {
    structure:structure, frame:'daily',
    currentPrice: Math.round(cur*100)/100,
    boxUpper: Math.round(bu), boxClose: Math.round(bc), boxLower: Math.round(bl),
    dojiUpper:0, dojiClose:0, dojiLower:0, dojiType:'none',
    eventClose:0, volLevel:volLevel, volContext:volCtx,
    gap:'none', retest:'pending', currency:tv.currency,
    note: tv.name+' | TradingView 스캐너',
    indicators:{
      sma:{s5:r.SMA5, s20:r.SMA20, s60:r.SMA50, s120:r.SMA100},
      rsi: r.RSI, bb:{upper:r['BB.upper'],middle:r['BB.middle'],lower:r['BB.lower']},
      macd:{line:r['MACD.macd']||null, signal:r['MACD.signal']||null, hist:r['MACD.hist']||null},
      candle:{name:'최신봉 '+((r.change||0)>0?'▲양봉':'▼음봉'), desc:'전일 대비 '+(r.change?((r.change>0?'+':'')+r.change.toFixed(2)+'%'):'±0%'), sentiment:(r.change||0)>0?'bullish':'bearish'},
      vol:{cur:Math.round(curVol), avg:Math.round(avgVol)},
      trend:structure, patterns:patterns,
      rsiDiv:rsiDiv, macdCross:macdCross, obvTrend:null,
      multiCandle:null, maSlopes:{s5:0,s20:0,s60:0}, devs:devs,
      closes:[], highs:[], lows:[],
    }
  };
}

// ══════════════════════════════════════
// ── 네이버 금융 API (한국 주식 전용, 프록시 불필요) ──
// ══════════════════════════════════════
async function fetchNaver(rawSym){
  var sym = rawSym.toUpperCase().replace(/^(KRX|KRSE):/,'').replace(/\.(KS|KQ)$/,'');
  if(!/^\d{4,6}$/.test(sym)) return null; // 한국 주식 코드만

  var urls = [
    // 1. 네이버 금융 차트 API (일봉 130개)
    'https://api.stock.naver.com/chart/domestic/candles/D?symbol='+sym+'&count=130',
    // 2. 네이버 금융 fchart (구형, 데이터 다를 수 있음)
    'https://fchart.stock.naver.com/sise.nhn?symbol='+sym+'&timeframe=day&count=130&requestType=0',
  ];

  // 1번 시도: JSON 형식
  try {
    var ctrl1 = new AbortController();
    var t1 = setTimeout(function(){ ctrl1.abort(); }, 5000);
    var r1 = await fetch(urls[0], {signal: ctrl1.signal});
    clearTimeout(t1);
    if(r1.ok){
      var d1 = await r1.json();
      // 네이버 응답: [{localDate, openPrice, highPrice, lowPrice, closePrice, accumulatedTradingVolume}, ...]
      if(d1 && d1.length >= 5){
        var rows = d1.filter(function(r){ return r.closePrice > 0; });
        if(rows.length >= 5){
          return {
            closes: rows.map(function(r){ return +r.closePrice; }),
            opens:  rows.map(function(r){ return +r.openPrice; }),
            highs:  rows.map(function(r){ return +r.highPrice; }),
            lows:   rows.map(function(r){ return +r.lowPrice; }),
            vols:   rows.map(function(r){ return +(r.accumulatedTradingVolume||r.tradingVolume||0); }),
            curPrice: +rows[rows.length-1].closePrice,
            currency: 'KRW', name: sym, source: '네이버금융'
          };
        }
      }
    }
  } catch(_){}

  // 2번 시도: fchart XML 파싱
  try {
    var ctrl2 = new AbortController();
    var t2 = setTimeout(function(){ ctrl2.abort(); }, 5000);
    var r2 = await fetch(urls[1], {signal: ctrl2.signal});
    clearTimeout(t2);
    if(r2.ok){
      var txt = await r2.text();
      // <item data="20240621|76500|75000|77000|74500|13000000" />
      var items = [...txt.matchAll(/data="(\d{8})\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)"/g)];
      if(items.length >= 5){
        return {
          closes: items.map(function(m){ return +m[2]; }),
          opens:  items.map(function(m){ return +m[3]; }),
          highs:  items.map(function(m){ return +m[4]; }),
          lows:   items.map(function(m){ return +m[5]; }),
          vols:   items.map(function(m){ return +m[6]; }),
          curPrice: +items[items.length-1][2],
          currency: 'KRW', name: sym, source: '네이버금융(fchart)'
        };
      }
    }
  } catch(_){}

  return null;
}

// ── Alpha Vantage (무료 API 키 필요, 미국·한국 주식 지원, CORS 허용) ──
async function fetchAlphaVantage(rawSym){
  var key = localStorage.getItem('av_api_key');
  if(!key) return null;

  var sym = rawSym.toUpperCase().replace(/^(KRX|KRSE):/,'').replace(/\.(KS|KQ)$/,'');
  // 한국 주식은 KRX 접미사 추가
  if(/^\d{4,6}$/.test(sym)) sym = sym+'.KRX';

  try {
    var ctrl = new AbortController();
    var timer = setTimeout(function(){ ctrl.abort(); }, 10000);
    var url = 'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol='+encodeURIComponent(sym)+'&outputsize=compact&apikey='+encodeURIComponent(key);
    var resp = await fetch(url, {signal: ctrl.signal});
    clearTimeout(timer);
    if(!resp.ok) return null;
    var data = await resp.json();

    var ts = data['Time Series (Daily)'];
    if(!ts) return null;

    var dates = Object.keys(ts).sort(); // 오름차순
    if(dates.length < 5) return null;

    var isCurrency = sym.endsWith('.KRX') ? 'KRW' : 'USD';
    return {
      closes: dates.map(function(d){ return +ts[d]['4. close']; }),
      opens:  dates.map(function(d){ return +ts[d]['1. open']; }),
      highs:  dates.map(function(d){ return +ts[d]['2. high']; }),
      lows:   dates.map(function(d){ return +ts[d]['3. low']; }),
      vols:   dates.map(function(d){ return +ts[d]['6. volume']||0; }),
      curPrice: +ts[dates[dates.length-1]]['4. close'],
      currency: isCurrency, name: sym, source: 'Alpha Vantage'
    };
  } catch(_){ return null; }
}

// ── Stooq.com 시세 (Yahoo Finance 차단 시 대안) ──
function toStooqSym(raw){
  var sym = raw.toUpperCase().replace(/^(KRX|KRSE):/,'').replace(/\.(KS|KQ)$/,'');
  if(/^\d{4,6}$/.test(sym)) return sym+'.ko';  // 한국 주식
  if(/^BTC/.test(sym)||/^ETH/.test(sym)) return null; // 암호화폐 미지원
  return sym.toLowerCase()+'.us';              // 미국 주식
}

async function fetchStooq(rawSym){
  var stooqSym = toStooqSym(rawSym);
  if(!stooqSym) return null;
  var currency = stooqSym.endsWith('.ko') ? 'KRW' : 'USD';
  var baseUrl = 'https://stooq.com/q/d/l/?s='+encodeURIComponent(stooqSym)+'&i=d&l=130';
  var proxies = [
    'https://corsproxy.io/?'+encodeURIComponent(baseUrl),
    'https://api.allorigins.win/raw?url='+encodeURIComponent(baseUrl),
    'https://api.allorigins.win/get?url='+encodeURIComponent(baseUrl),
    'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(baseUrl),
    'https://proxy.cors.sh/'+baseUrl,
  ];
  for(var i=0; i<proxies.length; i++){
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function(){ ctrl.abort(); }, 10000);
      var resp = await fetch(proxies[i], {signal: ctrl.signal});
      clearTimeout(timer);
      if(!resp.ok) continue;
      var text = await resp.text();
      // allorigins /get 래핑 처리
      if(text.charAt(0)==='{'){
        try { var j=JSON.parse(text); if(j.contents) text=j.contents; } catch(e){}
      }
      var rows = parseStooqCSV(text);
      if(rows && rows.length >= 5){
        return {
          closes:   rows.map(function(r){return r.c;}),
          opens:    rows.map(function(r){return r.o;}),
          highs:    rows.map(function(r){return r.h;}),
          lows:     rows.map(function(r){return r.l;}),
          vols:     rows.map(function(r){return r.v;}),
          curPrice: rows[rows.length-1].c,
          currency: currency,
          name:     stooqSym.toUpperCase(),
          source:   'Stooq'
        };
      }
    } catch(e){ continue; }
  }
  return null;
}

function parseStooqCSV(csv){
  var lines = csv.trim().split('\n');
  if(lines.length < 2) return null;
  var h = lines[0].toLowerCase().split(',');
  var di=h.indexOf('date'),oi=h.indexOf('open'),hi=h.indexOf('high'),li=h.indexOf('low'),ci=h.indexOf('close'),vi=h.indexOf('volume');
  if(ci===-1) return null;
  var rows=[];
  for(var i=1;i<lines.length;i++){
    var p=lines[i].split(',');
    if(p.length<5) continue;
    var c=parseFloat(p[ci]);
    if(!c||c<=0) continue;
    rows.push({o:parseFloat(p[oi])||c, h:parseFloat(p[hi])||c, l:parseFloat(p[li])||c, c:c, v:parseInt(p[vi])||0});
  }
  // Stooq는 최신이 앞, 역순 필요
  if(rows.length>1 && rows[0].c !== rows[rows.length-1].c) rows.reverse();
  return rows.length>=5 ? rows : null;
}

// ── 분석 결과 표시 공통 함수 ──
function _showAnalysis(out, ticker, closes, opens, highs, lows, vols, curPrice, currency, name, source){
  try {
    var aData = computeAutoAnalysis(closes, opens, highs, lows, vols, curPrice);
    aData.currency = currency;
    aData.note = name+' | '+source;

    var badge = '';
    try { badge = buildDetectedBadge(aData, curPrice, currency, name); } catch(_){}

    var analysis = '';
    try { analysis = generateAnalysis(aData); } catch(e){ analysis = '<div style="padding:12px;color:#f59e0b;font-size:12px">분석 렌더링 오류: '+e.message+'</div>'; }

    var techSection = '';
    try { techSection = buildTechSection(aData.indicators, curPrice, function(v){ return formatPrice(v, currency); }); } catch(_){}

    out.innerHTML = badge + analysis + techSection
      + '<div id="ct-news-area"><div style="padding:10px;text-align:center;color:var(--mt);font-size:12px">📰 뉴스 불러오는 중...</div></div>';

    try { fillForm(aData); } catch(_){}

    fetchNews(ticker).then(function(news){
      var el=document.getElementById('ct-news-area');
      if(el) el.innerHTML = buildNewsCard(news);
    }).catch(function(){});
  } catch(e){
    out.innerHTML = '<div style="padding:14px;color:#ef4444;font-size:13px">표시 오류: '+e.message+'</div>';
  }
}

// 자동 분석 메인 함수
window._ctAutoAnalyze = async function(symbol){
  var out = document.getElementById('ct-auto-output');
  if(!out) return;
  out.innerHTML = loading(symbol);

  var ticker = toYahooTicker(symbol);

  // ── 0순위: TradingView 스캐너 API ──
  out.innerHTML = loading(symbol + ' (TradingView 스캐너)');
  var tvData = null, tvErr = '';
  try {
    tvData = await fetchTradingViewScan(symbol);
  } catch(e){ tvErr = e.message; }

  if(tvData){
    try {
      var aData = tvScanToAnalysis(tvData);
      var tvHtml = buildDetectedBadge(aData, aData.currentPrice, tvData.currency, tvData.name)
        + generateAnalysis(aData);
      out.innerHTML = tvHtml + '<div id="ct-news-area"><div style="padding:10px;text-align:center;color:var(--mt);font-size:12px">📰 뉴스 불러오는 중...</div></div>';
      fillForm(aData);
      fetchNews(ticker).then(function(news){
        var el=document.getElementById('ct-news-area');
        if(el) el.innerHTML = buildNewsCard(news);
      });
      return;
    } catch(e){ tvErr = 'parse:'+e.message; tvData = null; }
  }

  // ── 1순위: 네이버 금융 (한국 주식) ──
  var naverSym = ticker.replace(/\.(KS|KQ)$/,'');
  if(/^\d{4,6}$/.test(naverSym)){
    out.innerHTML = loading(symbol + ' (네이버 금융)');
    var naver = await fetchNaver(naverSym);
    if(naver && naver.closes && naver.closes.length >= 5){
      _showAnalysis(out, ticker, naver.closes, naver.opens, naver.highs, naver.lows, naver.vols,
        naver.curPrice, 'KRW', naver.name, naver.source);
      return;
    }
  }

  // ── 2순위: Alpha Vantage (무료 API 키 설정 시) ──
  if(localStorage.getItem('av_api_key')){
    out.innerHTML = loading(symbol + ' (Alpha Vantage)');
    var av = await fetchAlphaVantage(symbol);
    if(av && av.closes && av.closes.length >= 5){
      _showAnalysis(out, ticker, av.closes, av.opens, av.highs, av.lows, av.vols,
        av.curPrice, av.currency, av.name, av.source);
      return;
    }
  }

  // ── 3순위: Cloudflare Worker ──
  out.innerHTML = loading(symbol);
  var pingRes = await _tryFetch('/ping', 5000);
  var workerDeployed = !!(pingRes.ok && pingRes.ok.worker);
  var pingDiag = 'ping:'+( pingRes.ok ? 'ok(v'+( pingRes.ok.v||'?')+')' : pingRes.error );

  var wRes = workerDeployed
    ? await _tryFetch('/api/quote?symbol='+encodeURIComponent(ticker), 15000)
    : {error:'not_deployed'};
  if(wRes.ok){
    try {
      var res=wRes.ok.chart.result[0], meta=res.meta, q=res.indicators.quote[0];
      var pairs=(res.timestamp||[]).map(function(_,i){return{c:q.close[i],o:q.open[i],h:q.high[i],l:q.low[i],v:q.volume[i]};})
        .filter(function(d){return d.c!=null&&d.h!=null&&d.l!=null&&+d.c>0;});
      if(pairs.length>=5){
        _showAnalysis(out, ticker,
          pairs.map(function(d){return+d.c;}), pairs.map(function(d){return+d.o;}),
          pairs.map(function(d){return+d.h;}), pairs.map(function(d){return+d.l;}),
          pairs.map(function(d){return+d.v||0;}),
          meta.regularMarketPrice||pairs[pairs.length-1].c,
          meta.currency||'KRW', meta.shortName||ticker, 'Cloudflare Worker');
        return;
      }
    } catch(e){}
  }

  // ── 2순위: Yahoo Finance CORS 프록시 ──
  var fetched = await fetchYahoo(ticker);
  if(!fetched.data && /^\d{6}\.KS$/.test(ticker)){
    var f2 = await fetchYahoo(ticker.replace('.KS','.KQ'));
    if(f2.data) fetched=f2;
    else fetched.errors=(fetched.errors||[]).concat(f2.errors||[]);
  }
  if(fetched.data){
    try {
      var res2=fetched.data.chart.result[0], meta2=res2.meta, q2=res2.indicators.quote[0];
      var pairs2=(res2.timestamp||[]).map(function(_,i){return{c:q2.close[i],o:q2.open[i],h:q2.high[i],l:q2.low[i],v:q2.volume[i]};})
        .filter(function(d){return d.c!=null&&d.h!=null&&d.l!=null&&+d.c>0;});
      if(pairs2.length>=5){
        _showAnalysis(out, ticker,
          pairs2.map(function(d){return+d.c;}), pairs2.map(function(d){return+d.o;}),
          pairs2.map(function(d){return+d.h;}), pairs2.map(function(d){return+d.l;}),
          pairs2.map(function(d){return+d.v||0;}),
          meta2.regularMarketPrice||pairs2[pairs2.length-1].c,
          meta2.currency||'KRW', meta2.shortName||ticker, 'Yahoo Finance');
        return;
      }
    } catch(e){}
  }

  // ── 3순위: Stooq.com (Yahoo Finance 대안 데이터) ──
  out.innerHTML = loading(symbol + ' (Stooq 전환 중...)');
  var stooq = await fetchStooq(symbol);
  if(stooq && stooq.closes.length>=5){
    _showAnalysis(out, ticker, stooq.closes, stooq.opens, stooq.highs, stooq.lows, stooq.vols,
      stooq.curPrice, stooq.currency, stooq.name, 'Stooq');
    return;
  }

  // ── 전부 실패 — 인라인 직접 입력으로 전환 ──
  var errSummary = [
    'TV:'+(tvData?'ok':tvErr||'CORS차단'),
    'Naver:'+(typeof naver!=='undefined'?(naver?'ok':'실패'):'미시도'),
    'Worker:'+(workerDeployed?wRes.error:'미배포'),
    'Proxy:'+(fetched&&fetched.errors?fetched.errors.filter(Boolean)[0]||'차단':'차단')
  ].join(' | ');
  out.innerHTML = '<div style="margin-top:12px;background:var(--s2);border-radius:14px;border:1px solid var(--bd);padding:18px">'
  +'<div style="font-size:14px;font-weight:800;color:var(--tx);margin-bottom:4px">📊 차트 분석</div>'
  +'<div style="font-size:12px;color:#6b7280;margin-bottom:14px">위 TradingView 차트를 보고 현재가와 지지·저항을 입력하세요 <span style="font-size:10px;color:#4b5563">| '+errSummary+'</span></div>'
  // 가격 입력 (심플하게)
  +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
  +'<div>'
  +'<div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:5px">현재가 *</div>'
  +'<input id="ct-quick-price" style="width:100%;padding:10px 12px;background:var(--bg);border:1.5px solid var(--ac);border-radius:8px;color:var(--tx);font-size:16px;font-weight:700;box-sizing:border-box" type="number" placeholder="예: 75000" autofocus>'
  +'</div>'
  +'<div>'
  +'<div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:5px">추세</div>'
  +'<select id="ct-quick-structure" style="width:100%;padding:10px 12px;background:var(--bg);border:1.5px solid var(--bd);border-radius:8px;color:var(--tx);font-size:13px;box-sizing:border-box">'
  +'<option value="box">📦 박스 횡보</option>'
  +'<option value="trend-up">📈 상승 추세</option>'
  +'<option value="trend-down">📉 하락 추세</option>'
  +'</select>'
  +'</div>'
  +'</div>'
  +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
  +'<div>'
  +'<div style="font-size:12px;font-weight:700;color:#ef4444;margin-bottom:5px">저항 (박스 상단)</div>'
  +'<input id="ct-quick-upper" style="width:100%;padding:10px 12px;background:var(--bg);border:1.5px solid var(--bd);border-radius:8px;color:var(--tx);font-size:14px;box-sizing:border-box" type="number" placeholder="고점 가격대">'
  +'</div>'
  +'<div>'
  +'<div style="font-size:12px;font-weight:700;color:#22c55e;margin-bottom:5px">지지 (박스 하단)</div>'
  +'<input id="ct-quick-lower" style="width:100%;padding:10px 12px;background:var(--bg);border:1.5px solid var(--bd);border-radius:8px;color:var(--tx);font-size:14px;box-sizing:border-box" type="number" placeholder="저점 가격대">'
  +'</div>'
  +'</div>'
  +'<button onclick="window._ctQuickAnalyze()" style="width:100%;padding:14px;background:var(--ac);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer">📊 분석 실행</button>'
  +'</div>';
};

// Alpha Vantage API 키 설정
window._ctSetAvKey = function(){
  var cur = localStorage.getItem('av_api_key')||'';
  var key = prompt('Alpha Vantage 무료 API 키를 입력하세요.\n(https://www.alphavantage.co/support/#api-key 에서 무료 발급)\n\n현재: '+(cur?'설정됨':'없음'), cur);
  if(key===null) return; // 취소
  if(key.trim()){
    localStorage.setItem('av_api_key', key.trim());
    alert('✅ API 키 저장 완료! 이제 종목을 다시 검색하면 자동으로 데이터를 가져옵니다.');
  } else {
    localStorage.removeItem('av_api_key');
    alert('API 키 삭제됨');
  }
};

// 에러 화면에서 직접 입력 분석
window._ctQuickAnalyze = function(){
  var price = parseFloat((document.getElementById('ct-quick-price')||{}).value)||0;
  var upper = parseFloat(document.getElementById('ct-quick-upper').value)||0;
  var mid   = parseFloat(document.getElementById('ct-quick-mid').value)||0;
  var lower = parseFloat(document.getElementById('ct-quick-lower').value)||0;
  var struct= document.getElementById('ct-quick-structure').value;
  if(!price){ alert('현재 가격을 입력해 주세요.'); return; }
  var cur = formatPrice ? formatPrice : function(v){ return Math.round(v).toLocaleString()+'원'; };
  var data = {
    structure: struct, frame:'daily',
    currentPrice: price, currency: 'KRW',
    boxUpper: upper, boxClose: mid, boxLower: lower,
    dojiUpper:0, dojiClose:0, dojiLower:0, dojiType:'none',
    eventClose:0, volLevel:'normal', volContext:'none',
    gap:'none', retest:'pending', note:'차트에서 직접 입력'
  };
  var out = document.getElementById('ct-auto-output');
  if(out) out.innerHTML = generateAnalysis(data);
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
  var indicators = computeIndicators(closes, opens, highs, lows, vols, currentPrice);
  return {
    structure: structure, frame: 'daily',
    currentPrice: rnd(currentPrice),
    boxUpper: rnd(boxUpper), boxClose: rnd(boxClose), boxLower: rnd(boxLower),
    dojiUpper: rnd(dojiU), dojiClose: rnd(dojiC), dojiLower: rnd(dojiL), dojiType: dojiType,
    eventClose: rnd(eventClose),
    volLevel: volLevel, volContext: volContext,
    gap: 'none', retest: 'pending', note: '',
    indicators: indicators
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

// ── % 계산 헬퍼 ──
function _pct(from, to){
  if(!from||!to||from===0) return null;
  var p=(to-from)/from*100;
  return (p>=0?'+':'')+p.toFixed(1)+'%';
}
function _rr(entry, stop, target){
  if(!entry||!stop||!target||entry===stop) return '';
  var risk=Math.abs(entry-stop), reward=Math.abs(target-entry);
  if(!risk) return ''; return '1:'+(reward/risk).toFixed(1);
}

// ── 차트 패턴 감지 ──
function detectChartPatterns(closes, highs, lows){
  var n=closes.length; if(n<20) return [];
  var patterns=[];

  // 1. 삼각수렴 (Triangle)
  var pn=Math.min(30,n), rH=highs.slice(-pn), rL=lows.slice(-pn);
  var sH=[], sL=[];
  for(var i=1;i<pn-1;i++){
    if(rH[i]>rH[i-1]&&rH[i]>rH[i+1]) sH.push({i:i,v:rH[i]});
    if(rL[i]<rL[i-1]&&rL[i]<rL[i+1]) sL.push({i:i,v:rL[i]});
  }
  if(sH.length>=2&&sL.length>=2){
    var hD=sH[sH.length-1].v<sH[sH.length-2].v;
    var lR=sL[sL.length-1].v>sL[sL.length-2].v;
    var hF=Math.abs(sH[sH.length-1].v-sH[sH.length-2].v)/Math.max(sH[0].v,0.001)<0.018;
    var lF=Math.abs(sL[sL.length-1].v-sL[sL.length-2].v)/Math.max(sL[0].v,0.001)<0.018;
    if(hD&&lR) patterns.push({name:'대칭삼각형 수렴 ▲▽',type:'neutral',
      desc:'고점은 낮아지고 저점은 높아지며 수렴 중. 거래량 감소 동반 → 이탈 방향이 다음 추세 결정. 거래량 동반 돌파/이탈 시 추세 가속 가능.'});
    else if(hF&&lR) patterns.push({name:'상승삼각형 (Ascending Triangle) ▲',type:'bullish',
      desc:'저항선 수평 + 저점 점진 상승 → 매수세 축적 중. 저항 돌파 + 거래량 급증 시 강한 상승 이탈 가능.'});
    else if(hD&&lF) patterns.push({name:'하락삼각형 (Descending Triangle) ▽',type:'bearish',
      desc:'고점 점진 하락 + 지지선 수평 → 매도세 축적 중. 지지 이탈 + 거래량 급증 시 강한 하락 이탈 가능.'});
  }

  // 2. 불/베어 플래그 (Flag)
  if(n>=25){
    var pol=10, flg=10;
    var pS=closes[n-pol-flg-1]||closes[0], pE=closes[n-flg-1];
    var pM=(pE-pS)/Math.max(pS,0.001);
    var fH=highs.slice(-flg), fL=lows.slice(-flg);
    var fR=(Math.max.apply(null,fH)-Math.min.apply(null,fL))/Math.max(Math.abs(pE),0.001);
    if(Math.abs(pM)>0.07&&fR<0.06){
      if(pM>0) patterns.push({name:'불 플래그 (Bull Flag) 🚩',type:'bullish',
        desc:'강한 상승(폴 '+(_pct(pS,pE)||'')+')'+'후 타이트한 횡보 조정(플래그 범위 '+Math.round(fR*100)+'%). 상방 이탈 + 거래량 증가 시 폴 높이만큼 추가 상승 가능.'});
      else patterns.push({name:'베어 플래그 (Bear Flag) 🚩',type:'bearish',
        desc:'강한 하락(폴 '+(_pct(pS,pE)||'')+')'+'후 타이트한 횡보 반등(플래그 범위 '+Math.round(fR*100)+'%). 하방 이탈 + 거래량 증가 시 추가 하락 가능.'});
    }
  }

  // 3. 이중 바닥/천장 (Double Bottom/Top)
  if(n>=40){
    var h1=Math.max.apply(null,highs.slice(-40,-20)), h2=Math.max.apply(null,highs.slice(-20));
    var l1=Math.min.apply(null,lows.slice(-40,-20)),  l2=Math.min.apply(null,lows.slice(-20));
    var cur=closes[n-1];
    if(Math.abs(h1-h2)/Math.max(h1,0.001)<0.025&&cur<(h1+h2)/2*0.97)
      patterns.push({name:'이중천장 의심 (Double Top / M패턴) ⛰',type:'bearish',
        desc:'두 고점이 유사한 가격대('+_pct(h1,h2)+'차)에서 저항. 목선(두 고점 사이 저점) 이탈 시 강한 하락 전환 신호.'});
    if(Math.abs(l1-l2)/Math.max(l1,0.001)<0.025&&cur>(l1+l2)/2*1.03)
      patterns.push({name:'이중바닥 확인 (Double Bottom / W패턴) 🏔',type:'bullish',
        desc:'두 저점이 유사한 가격대('+_pct(l1,l2)+'차)에서 지지. 목선(두 저점 사이 고점) 돌파 시 강한 상승 전환 신호.'});
  }

  // 4. 추세선 돌파 (Trendline)
  if(n>=20){
    var r10h=highs.slice(-10), r10l=lows.slice(-10);
    var maxH=Math.max.apply(null,r10h), minL=Math.min.apply(null,r10l);
    var range=(maxH-minL)/Math.max(closes[n-1],0.001)*100;
    if(range<4) patterns.push({name:'초압축 구간 (Tight Squeeze)',type:'neutral',
      desc:'최근 10일 변동폭 '+range.toFixed(1)+'% 이하 초압축 → 볼린저 밴드 스퀴즈. 큰 방향성 이탈이 임박할 수 있음.'});
  }

  return patterns;
}

// ── 추세 흐름 분석 ──
function buildTrendFlow(ind, closes, cur, fp){
  var s=ind.sma, rsi=ind.rsi, mac=ind.macd, bb=ind.bb, vol=ind.vol;
  var n=closes.length;
  var bullets=[];

  // MA 배열
  if(s.s20&&s.s60){
    if(s.s20>s.s60&&cur>s.s20)
      bullets.push({c:'#22c55e', t:'MA 정배열 상승 추세 — SMA20>SMA60 (골든크로스) + 현재가>SMA20. 중기 상승 추세 유효.'});
    else if(s.s20<s.s60&&cur<s.s20)
      bullets.push({c:'#ef4444', t:'MA 역배열 하락 추세 — SMA20<SMA60 (데드크로스) + 현재가<SMA20. 중기 하락 추세 유효.'});
    else if(cur>s.s20&&s.s20<s.s60)
      bullets.push({c:'#f59e0b', t:'역배열 속 단기 반등 — SMA20<SMA60이나 현재가>SMA20. 반등이 추세 전환인지 확인 필요.'});
    else
      bullets.push({c:'#f59e0b', t:'정배열 속 단기 조정 — SMA20>SMA60이나 현재가<SMA20. 단기 눌림. SMA20 회복 여부 주목.'});
  }

  // 20일 방향성
  if(n>=20){
    var a=closes.slice(-20,n-10).reduce(function(s,x){return s+x;},0)/10;
    var b=closes.slice(-10).reduce(function(s,x){return s+x;},0)/10;
    if(b>a*1.03) bullets.push({c:'#22c55e', t:'최근 20일 가격 흐름 상승 — 전반(평균 '+fp(Math.round(a))+') → 후반(평균 '+fp(Math.round(b))+'). 단기 상승 압력.'});
    else if(b<a*0.97) bullets.push({c:'#ef4444', t:'최근 20일 가격 흐름 하락 — 전반(평균 '+fp(Math.round(a))+') → 후반(평균 '+fp(Math.round(b))+'). 단기 하락 압력.'});
    else bullets.push({c:'#6b7280', t:'최근 20일 가격 흐름 횡보 — 전반/후반 평균 유사. 방향 탐색 중.'});
  }

  // RSI 추세 맥락
  if(rsi!==null){
    if(rsi<30) bullets.push({c:'#22c55e', t:'RSI '+rsi+' 과매도 영역 — 단기 기술적 반등 확률 높음. 단, 강한 하락 추세 중엔 추가 하락 가능.'});
    else if(rsi>70) bullets.push({c:'#ef4444', t:'RSI '+rsi+' 과매수 영역 — 단기 차익 실현 압력. 단, 강한 상승 추세 중엔 지속 상승 가능.'});
    else if(rsi>=50) bullets.push({c:'#22c55e', t:'RSI '+rsi+' 중립 상방 — 매수세 약간 우위. 50 지지 여부가 추세 지속의 관건.'});
    else bullets.push({c:'#f59e0b', t:'RSI '+rsi+' 중립 하방 — 매도세 약간 우위. 30 접근 시 과매도 반등 주시.'});
  }

  // MACD 모멘텀
  if(mac){
    if(mac.hist>0&&mac.line>0) bullets.push({c:'#22c55e', t:'MACD 양권 + 히스토그램 플러스 — 상승 모멘텀 확인. 히스토그램 확대 시 가속.'});
    else if(mac.hist>0&&mac.line<0) bullets.push({c:'#22c55e', t:'MACD 히스토그램 개선 중 — 하락 모멘텀 약화, 반전 가능성 탐색.'});
    else if(mac.hist<0&&mac.line>0) bullets.push({c:'#f59e0b', t:'MACD 히스토그램 감소 — 상승 모멘텀 약화 주의. 조정 가능성.'});
    else bullets.push({c:'#ef4444', t:'MACD 음권 + 히스토그램 마이너스 — 하락 모멘텀 지속.'});
  }

  // 볼린저 밴드
  if(bb){
    var bw=Math.round((bb.upper-bb.lower)/bb.middle*100);
    if(cur>=bb.upper*0.97) bullets.push({c:'#f59e0b', t:'볼린저 상단('+fp(Math.round(bb.upper))+') 근처 — 단기 과매수 또는 강한 상승 추세. 밴드 상단 돌파 시 추세 가속.'});
    else if(cur<=bb.lower*1.03) bullets.push({c:'#22c55e', t:'볼린저 하단('+fp(Math.round(bb.lower))+') 근처 — 단기 과매도 또는 강한 하락. 반등 탐색 구간.'});
    if(bw<8) bullets.push({c:'#f97316', t:'볼린저 밴드 폭 '+bw+'% 극도 수렴 — 큰 방향성 이탈 임박. 이탈 방향이 다음 추세.'});
    else if(bw>25) bullets.push({c:'#6b7280', t:'볼린저 밴드 폭 '+bw+'% 확대 — 변동성 큼. 현재 추세 강함.'});
  }

  // 거래량
  if(vol.cur&&vol.avg){
    var vr=Math.round(vol.cur/vol.avg*10)/10;
    if(vr>2) bullets.push({c:'#f59e0b', t:'거래량 급증 ('+vr+'배) — 수급 집중. 방향 확인 필수.'});
    else if(vr<0.6) bullets.push({c:'#22c55e', t:'거래량 감소 ('+vr+'배) — 매도 압력 약화. 조정/눌림 구간에선 긍정적 신호.'});
  }

  return bullets;
}

// ══════════════════════════════════════
// ── 보조지표 계산 함수 ──
// ══════════════════════════════════════
function _sma(a,n){ return a.length>=n ? a.slice(-n).reduce(function(s,x){return s+x;},0)/n : null; }
// MA 기울기 (상승/하락/횡보)
function _maSlope(cl,n){ var ma1=_sma(cl.slice(0,-3),n), ma2=_sma(cl,n); if(!ma1||!ma2) return 0; return (ma2-ma1)/ma1*100; }
// RSI 배열 (Wilder Smoothing)
function _rsiArr(cl,n){
  if(cl.length<=n*2) return null;
  var ch=[]; for(var i=1;i<cl.length;i++) ch.push(cl[i]-cl[i-1]);
  var ag=ch.slice(0,n).reduce(function(s,x){return s+Math.max(x,0);},0)/n;
  var al=ch.slice(0,n).reduce(function(s,x){return s+Math.max(-x,0);},0)/n;
  var arr=[];
  for(var i=n;i<ch.length;i++){
    ag=(ag*(n-1)+Math.max(ch[i],0))/n; al=(al*(n-1)+Math.max(-ch[i],0))/n;
    arr.push(al===0?100:Math.round((100-100/(1+ag/al))*10)/10);
  }
  return arr;
}
// RSI 다이버전스 감지
function _rsiDiv(cl, rArr){
  if(!rArr||rArr.length<20) return null;
  var n=Math.min(20,rArr.length);
  var pc=cl.slice(-n), pr=rArr.slice(-n);
  var h1=Math.max.apply(null,pc.slice(0,Math.floor(n/2))), h2=Math.max.apply(null,pc.slice(Math.floor(n/2)));
  var l1=Math.min.apply(null,pc.slice(0,Math.floor(n/2))), l2=Math.min.apply(null,pc.slice(Math.floor(n/2)));
  var rh1=Math.max.apply(null,pr.slice(0,Math.floor(n/2))), rh2=Math.max.apply(null,pr.slice(Math.floor(n/2)));
  var rl1=Math.min.apply(null,pr.slice(0,Math.floor(n/2))), rl2=Math.min.apply(null,pr.slice(Math.floor(n/2)));
  if(l2<l1*0.998&&rl2>rl1+1) return 'bullish'; // 가격↓ RSI↑ = 강세 다이버전스
  if(h2>h1*1.002&&rh2<rh1-1) return 'bearish'; // 가격↑ RSI↓ = 약세 다이버전스
  return null;
}
// MACD 크로스 감지
function _macdCross(cl,f,sl,sg){
  var e12=_emaFull(cl,f), e26=_emaFull(cl,sl); if(!e12||!e26) return null;
  var off=cl.length-e26.length, ml=e26.map(function(_,i){return e12[i+off]-e26[i];});
  var sig=_emaFull(ml,sg); if(!sig||sig.length<2) return null;
  var n=sig.length;
  var pm=ml[ml.length-2], cm=ml[ml.length-1], ps=sig[n-2], cs=sig[n-1];
  if(pm<ps&&cm>=cs) return 'golden';
  if(pm>ps&&cm<=cs) return 'dead';
  return null;
}
// OBV 트렌드 (On-Balance Volume)
function _obvTrend(cl,vo){
  if(cl.length<10) return null;
  var obv=0, arr=[0];
  for(var i=1;i<cl.length;i++){
    obv+=(cl[i]>cl[i-1]?1:cl[i]<cl[i-1]?-1:0)*(vo[i]||0);
    arr.push(obv);
  }
  var last10=arr.slice(-10), first5=last10.slice(0,5), last5=last10.slice(5);
  var a1=first5.reduce(function(s,x){return s+x;},0)/5, a2=last5.reduce(function(s,x){return s+x;},0)/5;
  if(a2>a1*1.01) return 'up';
  if(a2<a1*0.99) return 'down';
  return 'flat';
}
// 3봉 패턴 감지
function _multiCandle(op,hi,lo,cl){
  var n=cl.length; if(n<3) return null;
  var o1=op[n-3],h1=hi[n-3],l1=lo[n-3],c1=cl[n-3];
  var o2=op[n-2],h2=hi[n-2],l2=lo[n-2],c2=cl[n-2];
  var o3=op[n-1],h3=hi[n-1],l3=lo[n-1],c3=cl[n-1];
  // 샛별형 (Morning Star): 긴 음봉 → 소형봉 → 긴 양봉
  if(c1<o1&&Math.abs(c1-o1)/Math.max(h1-l1,0.001)>0.5 &&
     Math.abs(c2-o2)/Math.max(h2-l2,0.001)<0.3 &&
     c3>o3&&Math.abs(c3-o3)/Math.max(h3-l3,0.001)>0.5 &&
     c3>((c1+o1)/2))
    return {name:'샛별형 (Morning Star)', desc:'긴 음봉 → 소형봉(도지) → 긴 양봉. 하락 추세 강한 반전 신호.', sentiment:'bullish'};
  // 석별형 (Evening Star): 긴 양봉 → 소형봉 → 긴 음봉
  if(c1>o1&&Math.abs(c1-o1)/Math.max(h1-l1,0.001)>0.5 &&
     Math.abs(c2-o2)/Math.max(h2-l2,0.001)<0.3 &&
     c3<o3&&Math.abs(c3-o3)/Math.max(h3-l3,0.001)>0.5 &&
     c3<((c1+o1)/2))
    return {name:'석별형 (Evening Star)', desc:'긴 양봉 → 소형봉(도지) → 긴 음봉. 상승 추세 강한 반전 신호.', sentiment:'bearish'};
  // 세 개의 백색 군인 (Three White Soldiers)
  if(c1>o1&&c2>o2&&c3>o3&&c2>c1&&c3>c2&&o2>o1&&o3>o2)
    return {name:'적삼병 (Three White Soldiers)', desc:'연속 3양봉 상승. 강한 매수세 지속 신호.', sentiment:'bullish'};
  // 흑삼병 (Three Black Crows)
  if(c1<o1&&c2<o2&&c3<o3&&c2<c1&&c3<c2&&o2<o1&&o3<o2)
    return {name:'흑삼병 (Three Black Crows)', desc:'연속 3음봉 하락. 강한 매도세 지속 신호.', sentiment:'bearish'};
  return null;
}
function _emaFull(a,n){
  if(a.length<n) return null;
  var k=2/(n+1), r=[a.slice(0,n).reduce(function(s,x){return s+x;},0)/n];
  for(var i=n;i<a.length;i++) r.push(a[i]*k+r[r.length-1]*(1-k));
  return r;
}
function _rsi(cl,n){
  if(cl.length<=n) return null;
  var ch=[]; for(var i=1;i<cl.length;i++) ch.push(cl[i]-cl[i-1]);
  var rc=ch.slice(-(n*3));
  var ag=rc.slice(0,n).map(function(x){return Math.max(x,0);}).reduce(function(s,x){return s+x;},0)/n;
  var al=rc.slice(0,n).map(function(x){return Math.max(-x,0);}).reduce(function(s,x){return s+x;},0)/n;
  for(var i=n;i<rc.length;i++){ag=(ag*(n-1)+Math.max(rc[i],0))/n; al=(al*(n-1)+Math.max(-rc[i],0))/n;}
  return al===0 ? 100 : Math.round((100-100/(1+ag/al))*10)/10;
}
function _bb(cl,n,m){
  if(cl.length<n) return null;
  var r=cl.slice(-n), avg=r.reduce(function(s,x){return s+x;},0)/n;
  var std=Math.sqrt(r.reduce(function(s,x){return s+Math.pow(x-avg,2);},0)/n);
  return {upper:avg+m*std, middle:avg, lower:avg-m*std};
}
function _macd(cl,f,sl,sg){
  var e12=_emaFull(cl,f), e26=_emaFull(cl,sl);
  if(!e12||!e26) return null;
  var off=cl.length-e26.length, ml=e26.map(function(_,i){return e12[i+off]-e26[i];});
  var sig=_emaFull(ml,sg); if(!sig) return null;
  var m=ml[ml.length-1], s=sig[sig.length-1];
  return {line:Math.round(m*100)/100, signal:Math.round(s*100)/100, hist:Math.round((m-s)*100)/100};
}
function _candle(opens,highs,lows,closes){
  var n=closes.length; if(n<2) return {name:'봉 데이터 부족',desc:'',sentiment:'neutral'};
  var o=opens[n-1],h=highs[n-1],l=lows[n-1],c=closes[n-1];
  var po=opens[n-2],pc=closes[n-2];
  var body=Math.abs(c-o), range=h-l;
  if(range<0.001) return {name:'일자봉',desc:'거래 없음',sentiment:'neutral'};
  var up=h-Math.max(c,o), dn=Math.min(c,o)-l, br=body/range;
  if(br<0.1){
    if(up>dn*3) return {name:'비석형 도지 (Gravestone)',desc:'위 꼬리 길고 몸통 없음 — 상승 후 매도 압력 경고',sentiment:'bearish'};
    if(dn>up*3) return {name:'잠자리형 도지 (Dragonfly)',desc:'아래 꼬리 길고 몸통 없음 — 하락 후 매수 반응 신호',sentiment:'bullish'};
    return {name:'도지 (Doji)',desc:'매수·매도 힘의 균형 — 방향 결정 전의 전장',sentiment:'neutral'};
  }
  if(c>o&&pc<po&&c>=po&&o<=pc) return {name:'상승장악형 (Bullish Engulfing)',desc:'전봉 음봉을 완전히 감싸는 양봉 — 강한 매수 전환 신호',sentiment:'bullish'};
  if(c<o&&pc>po&&c<=po&&o>=pc) return {name:'하락장악형 (Bearish Engulfing)',desc:'전봉 양봉을 완전히 감싸는 음봉 — 강한 매도 전환 신호',sentiment:'bearish'};
  if(dn>body*2&&up<body*0.5){
    return c>pc ? {name:'망치형 (Hammer)',desc:'아래 꼬리가 길고 몸통 작음 — 하락 중 강한 매수 반응, 반등 가능 신호',sentiment:'bullish'} :
                  {name:'교수형 (Hanging Man)',desc:'아래 꼬리가 길고 몸통 작음 — 상승 후 매도 압력 주의',sentiment:'bearish'};
  }
  if(up>body*2&&dn<body*0.5){
    return c<pc ? {name:'유성형 (Shooting Star)',desc:'위 꼬리가 길고 몸통 작음 — 상승 후 매도 압력, 하락 전환 주의',sentiment:'bearish'} :
                  {name:'역망치형 (Inverted Hammer)',desc:'위 꼬리가 길고 몸통 작음 — 하락 중 매수 시도 신호',sentiment:'bullish'};
  }
  if(br>0.85) return c>o ? {name:'장대양봉 (Bullish Marubozu)',desc:'꼬리 거의 없는 큰 양봉 — 매수세 완전 우위, 강한 상승 모멘텀 확인',sentiment:'bullish'} :
                            {name:'장대음봉 (Bearish Marubozu)',desc:'꼬리 거의 없는 큰 음봉 — 매도세 완전 우위, 강한 하락 모멘텀 확인',sentiment:'bearish'};
  return c>o ? {name:'양봉',desc:'매수세 우위',sentiment:'bullish'} : {name:'음봉',desc:'매도세 우위',sentiment:'bearish'};
}
function computeIndicators(cl,op,hi,lo,vo,p){
  var avgVol=vo.length?vo.slice(-60).reduce(function(s,x){return s+x;},0)/Math.min(60,vo.length):0;
  var s5=_sma(cl,5), s20=_sma(cl,20), s60=_sma(cl,60), s120=_sma(cl,120);
  var rsi=_rsi(cl,14), bb=_bb(cl,20,2), mac=_macd(cl,12,26,9), cdl=_candle(op,hi,lo,cl);
  var trend='sideways';
  if(s20&&s60){if(s20>s60&&p>s20)trend='up';else if(s20<s60&&p<s20)trend='down';}
  var patterns=detectChartPatterns(cl,hi,lo);
  // 추가 분석
  var rsiArray=_rsiArr(cl,14);
  var rsiDiv=rsiArray?_rsiDiv(cl,rsiArray):null;
  var macdCross=_macdCross(cl,12,26,9);
  var obvTrend=_obvTrend(cl,vo);
  var multiCdl=_multiCandle(op,hi,lo,cl);
  var maSlopes={s5:_maSlope(cl,5), s20:_maSlope(cl,20), s60:_maSlope(cl,60)};
  // 이격도 (MA 대비 현재가 %)
  var devs={s5:s5?(p-s5)/s5*100:null, s20:s20?(p-s20)/s20*100:null, s60:s60?(p-s60)/s60*100:null};
  return {sma:{s5:s5,s20:s20,s60:s60,s120:s120}, rsi:rsi, bb:bb, macd:mac, candle:cdl,
          vol:{cur:vo[vo.length-1]||0, avg:Math.round(avgVol)}, trend:trend,
          patterns:patterns, closes:cl, highs:hi, lows:lo,
          rsiDiv:rsiDiv, macdCross:macdCross, obvTrend:obvTrend,
          multiCandle:multiCdl, maSlopes:maSlopes, devs:devs};
}

// ── 기술적 분석 HTML 빌더 ──
// ── 매매 근거 카드 ──
function buildReasonCard(d, fp, ind, isBuyA, patterns){
  if(!ind) return '';
  var cur=d.currentPrice||0, rsi=ind.rsi, mac=ind.macd, bb=ind.bb;
  var s2=ind.sma||{}, vol=ind.vol||{}, cdl=ind.candle;
  var rsiDiv=ind.rsiDiv, macdCross=ind.macdCross, obvTrend=ind.obvTrend;
  var multi=ind.multiCandle, devs=ind.devs||{};

  function sec(title,col,lines){
    if(!lines||!lines.length) return '';
    return '<div style="margin-bottom:14px;padding:13px 14px;background:'+col+'0a;border-left:3px solid '+col+';border-radius:0 10px 10px 0">'
      +'<div style="font-size:12px;font-weight:800;color:'+col+';margin-bottom:8px">'+title+'</div>'
      +'<div style="font-size:12px;color:var(--tx);line-height:1.85">'
      +lines.map(function(l){return '• '+l;}).join('<br>')
      +'</div></div>';
  }

  var sections=[], totalSig=0, posSig=0;

  // 1. 구조론 근거
  var strLines=[], bu=d.boxUpper||0, bl=d.boxLower||0, bc=d.boxClose||0;
  var du=d.dojiUpper||0, dl=d.dojiLower||0, dc=d.dojiClose||0;
  if(bc&&bl){
    strLines.push('1차 매수 '+fp(bc)+': 박스 내 다수 종가가 집중된 합의가격대. 많은 참여자의 평균 진입가 → 매수세 재유입 가능성 높음.');
    strLines.push('2차 매수 '+fp(bl)+': 박스 하단 = 매수·매도세 충돌 경계선. 기억된 매수세가 이 가격대를 지지.');
    strLines.push('손절 '+fp(Math.round(bl*0.985))+': 박스 하단 종가 이탈 시 지지→저항 전환 확정. 진입 근거 소멸 → 즉시 손절.');
    totalSig+=2; posSig+=2;
  } else if(dc&&dl){
    strLines.push('도지 종가 '+fp(dc)+': 압축된 전장의 합의가격. 시장 참여자 평균 진입가로 매수 지지력 높음.');
    strLines.push('도지 하단 '+fp(dl)+': 매수세 흔적이 남은 경계선. 기억된 매수세 재유입 가능.');
    totalSig+=2; posSig+=1;
  }
  if(strLines.length) sections.push(sec('📌 구조론 (차트술사) 매수 근거','#f59e0b',strLines));

  // 2. 이동평균선
  var maLines=[];
  if(s2.s20||s2.s60){
    var s20=s2.s20, s60=s2.s60||s2.s50;
    if(s20) maLines.push('SMA20 = '+fp(Math.round(s20))+(devs.s20?' (이격 '+(devs.s20>0?'+':'')+devs.s20.toFixed(1)+'%)':'')
      +' | 현재가 '+(cur>s20?'<b style="color:#22c55e">위 (단기 상승)</b>':'<b style="color:#ef4444">아래 (단기 조정)</b>'));
    if(s60) maLines.push('SMA60 = '+fp(Math.round(s60))+(devs.s60?' (이격 '+(devs.s60>0?'+':'')+devs.s60.toFixed(1)+'%)':'')
      +' | 현재가 '+(cur>s60?'<b style="color:#22c55e">위</b>':'<b style="color:#ef4444">아래</b>'));
    if(s20&&s60){
      if(s20>s60){ maLines.push('<b style="color:#22c55e">MA 정배열 (골든크로스)</b> — SMA20>SMA60. 중기 상승 추세 유효. 눌림 매수 관점 강화.'); totalSig++; posSig++; }
      else{ maLines.push('<b style="color:#f59e0b">MA 역배열 (데드크로스)</b> — SMA20<SMA60. 추세 역행 매수. 볼린저 하단·RSI 과매도 동반 시에만 진입 권장.'); totalSig++; }
    }
    if(s2.s5&&s20){
      var c5=(s2.s5>s20)?'#22c55e':'#f59e0b';
      maLines.push('단기: <b style="color:'+c5+'">'+(s2.s5>s20?'5MA>20MA (단기 골든크로스)':'5MA<20MA (단기 데드크로스)')+'</b>');
      totalSig++; if(s2.s5>s20)posSig++;
    }
    if(maLines.length) sections.push(sec('📈 이동평균선 (MA)','#60a5fa',maLines));
  }

  // 3. RSI + 다이버전스
  if(rsi!==null&&rsi!==undefined){
    var rLines=[], rC=rsi<30?'#22c55e':rsi>70?'#ef4444':'#f59e0b';
    var rLabel=rsi<30?'과매도 — 기술적 반등 확률 높음':rsi<40?'저권역 — 매수 유리 구간':rsi<50?'중립 하방 — 조정 중':rsi<60?'중립 상방':'과매수 영역';
    rLines.push('RSI(14) = <b style="color:'+rC+'">'+rsi+'</b> — '+rLabel);
    if(rsi<30){ rLines.push('RSI 30 이하 과매도 구간. 단기 반등 확률 높음. 1차 매수 적기.'); totalSig++; posSig++; }
    else if(rsi<40){ rLines.push('RSI 저권역. 추가 하락 여지 있으나 매수 우위 구간 진입 중.'); totalSig++; posSig++; }
    else if(rsi>70){ rLines.push('과매수 영역. 매수 비중 30~50%로 제한 권장.'); totalSig++; }
    else if(rsi>60){ rLines.push('상승권. 과열 주의. 매수 비중 75% 이하.'); totalSig++; }
    if(rsiDiv==='bullish'){ rLines.push('<b style="color:#22c55e">★ RSI 강세 다이버전스</b> — 가격은 신저점이나 RSI는 상승. 상승 반전 선행 신호. 매수 근거 크게 강화.'); totalSig++; posSig++; }
    if(rsiDiv==='bearish'){ rLines.push('<b style="color:#f59e0b">★ RSI 약세 다이버전스</b> — 가격은 신고점이나 RSI는 하락. 하락 반전 주의. 매수 비중 축소.'); totalSig++; }
    sections.push(sec('⚡ RSI (14일 상대강도지수)','#a855f7',rLines));
  }

  // 4. MACD
  if(mac){
    var mLines=[], mC=mac.hist>0?'#22c55e':'#ef4444';
    mLines.push('MACD = '+(mac.line>0?'+':'')+mac.line
      +' | 시그널 = '+(mac.signal>0?'+':'')+mac.signal
      +' | 히스토그램 = <b style="color:'+mC+'">'+(mac.hist>0?'+':'')+mac.hist+'</b>');
    if(macdCross==='golden'){ mLines.push('<b style="color:#22c55e">★ MACD 골든크로스 발생</b> — MACD가 시그널 상향 돌파. 매수 모멘텀 전환 확인.'); totalSig++; posSig++; }
    else if(macdCross==='dead'){ mLines.push('<b style="color:#f59e0b">★ MACD 데드크로스 발생</b> — 매도 모멘텀 전환. 구조론 지지 확인 후 신중 진입.'); totalSig++; }
    else if(mac.hist>0&&mac.line>0){ mLines.push('<b style="color:#22c55e">MACD 양권 + 히스토그램 플러스</b> — 매수 모멘텀 확인. 매수 근거 강화.'); totalSig++; posSig++; }
    else if(mac.hist<0&&mac.hist>mac.signal*0.5){ mLines.push('MACD 히스토그램 <b style="color:#22c55e">개선 중</b> — 하락 모멘텀 약화. 반전 준비 신호.'); totalSig++; posSig++; }
    else if(mac.hist<0){ mLines.push('MACD 음권 — 하락 모멘텀 지속. 히스토그램 개선 확인 후 매수 검토.'); totalSig++; }
    sections.push(sec('📊 MACD (12, 26, 9)','#f59e0b',mLines));
  }

  // 5. 볼린저밴드
  if(bb&&cur){
    var bLines=[];
    var bpct=bb.upper>bb.lower?Math.round((cur-bb.lower)/(bb.upper-bb.lower)*100):50;
    var bw=bb.middle>0?Math.round((bb.upper-bb.lower)/bb.middle*100):0;
    bLines.push('상단 '+fp(Math.round(bb.upper))+' | 중선 '+fp(Math.round(bb.middle))+' | 하단 '+fp(Math.round(bb.lower))+'  /  현재가 밴드 내 <b style="color:#60a5fa">'+bpct+'%</b>');
    if(cur<=bb.lower*1.02){ bLines.push('<b style="color:#22c55e">밴드 하단 근처 — 과매도 확인.</b> 반등 탐색 구간. 매수 신뢰도 강화.'); totalSig++; posSig++; }
    else if(cur>=bb.upper*0.98){ bLines.push('<b style="color:#f59e0b">밴드 상단 근처 — 단기 과매수.</b> 매수 비중 50% 이하 권장.'); totalSig++; }
    else if(cur>bb.middle){ bLines.push('중선 위 상승 편향. 상단('+fp(Math.round(bb.upper))+')까지 +'+Math.round((bb.upper-cur)/cur*100)+'% 여지.'); }
    else{ bLines.push('중선 아래 하락 편향. 중선('+fp(Math.round(bb.middle))+') 회복이 매수 신호 확인의 관건.'); }
    if(bw>0&&bw<8){ bLines.push('<b style="color:#f97316">밴드 극도 수렴 (폭 '+bw+'%)</b> — 큰 방향성 이탈 임박.'); totalSig++; posSig++; }
    else if(bw>0&&bw<15){ bLines.push('밴드 수렴 (폭 '+bw+'%) — 방향 탐색 중.'); }
    sections.push(sec('📏 볼린저밴드 (20일, ±2σ)','#06b6d4',bLines));
  }

  // 6. 거래량 + OBV
  if(vol.avg&&vol.cur){
    var vr=Math.round(vol.cur/vol.avg*10)/10;
    var vC=vr>1.8?'#f59e0b':vr>1.2?'#22c55e':'#6b7280';
    var vLines=['60일 평균 대비 <b style="color:'+vC+'">'+vr+'배</b>'];
    if(vr<0.6){ vLines.push('<b style="color:#22c55e">거래량 감소 ('+vr+'배)</b> — 눌림 중 매도 압력 약화. 에너지 재충전 신호. 매수 근거 강화.'); totalSig++; posSig++; }
    else if(vr>1.8){ vLines.push('거래량 급증 ('+vr+'배) — 수급 집중. 방향 확인 필요.'); totalSig++; }
    if(obvTrend==='up'){ vLines.push('<b style="color:#22c55e">OBV 상승</b> — 가격 선행 자금 유입. 상승 추세 뒷받침.'); totalSig++; posSig++; }
    if(obvTrend==='down'){ vLines.push('<b style="color:#f59e0b">OBV 하락</b> — 가격 선행 자금 이탈 중. 거래량 동반 상승 필수 확인.'); totalSig++; }
    sections.push(sec('📊 거래량 & OBV','#84cc16',vLines));
  }

  // 7. 캔들 + 차트 패턴
  var cpLines=[];
  if(multi){ var mc2=multi.sentiment==='bullish'?'#22c55e':'#ef4444'; cpLines.push('3봉 패턴: <b style="color:'+mc2+'">'+multi.name+'</b> — '+multi.desc); if(multi.sentiment==='bullish'){totalSig++;posSig++;}else{totalSig++;} }
  if(cdl&&cdl.name&&cdl.name!=='봉 데이터 부족'){ var cc2=cdl.sentiment==='bullish'?'#22c55e':cdl.sentiment==='bearish'?'#ef4444':'#6b7280'; cpLines.push('최근 봉: <b style="color:'+cc2+'">'+cdl.name+'</b> — '+cdl.desc); if(cdl.sentiment==='bullish'){totalSig++;posSig++;}else if(cdl.sentiment==='bearish'){totalSig++;} }
  if(patterns&&patterns.length){ patterns.forEach(function(pt){ var pc=pt.type==='bullish'?'#22c55e':pt.type==='bearish'?'#ef4444':'#6b7280'; cpLines.push('<b style="color:'+pc+'">'+pt.name+'</b> — '+pt.desc); if(pt.type==='bullish'){totalSig++;posSig++;}else if(pt.type==='bearish'){totalSig++;} }); }
  if(cpLines.length) sections.push(sec('🕯 캔들 & 차트 패턴','#f97316',cpLines));

  // 신호 강도
  var strength=totalSig>0?Math.round(posSig/totalSig*100):50;
  var sCol=strength>=70?'#22c55e':strength>=45?'#f59e0b':'#ef4444';
  var sLabel=strength>=70?'강함 ★★★':strength>=45?'보통 ★★☆':'약함 ★☆☆';

  var h='<div style="background:var(--bg);border-radius:14px;border:1px solid rgba(255,255,255,.1);padding:16px;margin-bottom:16px">';
  h+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">';
  h+='<div style="font-size:15px;font-weight:800;color:var(--tx)">💡 매수 근거 종합 분석</div>';
  h+='<div style="text-align:right"><div style="font-size:10px;color:#6b7280">신호 강도</div><div style="font-size:18px;font-weight:900;color:'+sCol+'">'+strength+'% '+sLabel+'</div></div>';
  h+='</div>';
  h+='<div style="height:8px;background:var(--s2);border-radius:4px;overflow:hidden;margin-bottom:14px"><div style="height:100%;width:'+strength+'%;background:'+sCol+';border-radius:4px"></div></div>';
  h+=sections.join('');
  h+='</div>';
  return h;
}

function _chip(lbl,val,col){
  return '<div style="background:'+col+'18;border:1px solid '+col+'44;border-radius:8px;padding:10px 6px;text-align:center">'
  +'<div style="font-size:11px;color:#b0bec5;margin-bottom:3px">'+lbl+'</div>'
  +'<div style="font-size:13px;font-weight:700;color:'+col+'">'+val+'</div></div>';
}
function buildTechSection(ind, cur, fp){
  if(!ind) return '';
  var s=ind.sma||{}, rsi=ind.rsi, bb=ind.bb, mac=ind.macd, cdl=ind.candle, vol=ind.vol;
  var patterns=ind.patterns||[];
  var rsiDiv=ind.rsiDiv, macdCross=ind.macdCross, obvTrend=ind.obvTrend;
  var multi=ind.multiCandle, slopes=ind.maSlopes||{}, devs=ind.devs||{};
  var closes=ind.closes||[], highs=ind.highs||[], lows=ind.lows||[];
  // ── 서술형 기술적 분석 빌더 ──
  function taCard(title, color, body){
    return '<div style="margin-bottom:12px;padding:14px 16px;background:'+color+'0d;border-left:4px solid '+color+';border-radius:0 10px 10px 0">'
    +'<div style="font-size:13px;font-weight:800;color:'+color+';margin-bottom:8px">'+title+'</div>'
    +'<div style="font-size:13px;color:var(--tx);line-height:1.8">'+body+'</div>'
    +'</div>';
  }
  function badge(txt, col){ return '<span style="display:inline-block;background:'+col+'22;border:1px solid '+col+'55;border-radius:6px;padding:1px 8px;font-size:11px;font-weight:700;color:'+col+';margin-left:4px">'+txt+'</span>'; }
  function hi(txt,col){ return '<b style="color:'+(col||'var(--tx)')+'">'+txt+'</b>'; }

  var rsiC=rsi!==null&&rsi!==undefined?(rsi<30?'#22c55e':rsi>70?'#ef4444':'#f59e0b'):'#6b7280';
  var rsiL=rsi!==null&&rsi!==undefined?(rsi<30?'과매도 (기술적 반등 신호)':rsi>70?'과매수 (단기 조정 주의)':rsi<50?'중립 — 하방 편향':'중립 — 상방 편향'):'N/A';

  // 추세 흐름 bullets (buildTrendFlow 호출)
  var trendBullets = [];
  try { trendBullets = buildTrendFlow(ind, closes, cur, fp) || []; } catch(_){}

  var html='<div style="margin-top:16px;background:var(--s2);border-radius:14px;border:1px solid var(--bd);padding:18px">';
  html+='<div style="font-size:16px;font-weight:900;color:var(--tx);margin-bottom:16px">📊 기술적 분석 (RSI다이버전스·MACD크로스·OBV·차트패턴 포함)</div>';

  // 1. 전체 추세 흐름
  if(trendBullets.length){
    html+='<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)">';
    html+='<div style="font-size:11px;font-weight:700;color:#60a5fa;margin-bottom:7px">📈 전체 추세 흐름</div>';
    html+=trendBullets.map(function(b){
      return '<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:5px">'
      +'<span style="color:'+b.c+';font-size:13px;flex-shrink:0;margin-top:-1px">●</span>'
      +'<span style="font-size:12px;color:#c5d5e0;line-height:1.7">'+b.t+'</span></div>';
    }).join('');
    html+='</div>';
  }

  // 2. 차트 패턴
  if(patterns.length){
    html+='<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)">';
    html+='<div style="font-size:11px;font-weight:700;color:#f97316;margin-bottom:7px">🔍 차트 패턴 감지</div>';
    patterns.forEach(function(pt){
      var pc=pt.type==='bullish'?'#22c55e':pt.type==='bearish'?'#ef4444':'#6b7280';
      html+='<div style="margin-bottom:8px;padding:10px 12px;background:'+pc+'0c;border-left:3px solid '+pc+';border-radius:0 8px 8px 0">';
      html+='<div style="font-size:12px;font-weight:700;color:'+pc+';margin-bottom:3px">'+pt.name+'</div>';
      html+='<div style="font-size:12px;color:#c5d5e0">'+pt.desc+'</div>';
      html+='</div>';
    });
    html+='</div>';
  }

  // 3. MA
  if(s.s20){
    html+='<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)">';
    html+='<div style="font-size:11px;font-weight:700;color:#60a5fa;margin-bottom:6px">📈 이동평균선 (MA)</div>';
    html+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:6px">';
    if(s.s5)   html+=_chip('SMA5',  fp(Math.round(s.s5)),   cur>s.s5?'#22c55e':'#ef4444');
    if(s.s20)  html+=_chip('SMA20', fp(Math.round(s.s20)),  cur>s.s20?'#22c55e':'#ef4444');
    if(s.s60)  html+=_chip('SMA60', fp(Math.round(s.s60)),  cur>s.s60?'#22c55e':'#ef4444');
    if(s.s120) html+=_chip('SMA120',fp(Math.round(s.s120)), cur>s.s120?'#22c55e':'#ef4444');
    html+='</div>';
    html+='<div style="font-size:12px;color:#c5d5e0">';
    if(s.s20&&s.s60) html+='• '+(s.s20>s.s60?'<b style="color:#22c55e">골든크로스</b> 상태':'<b style="color:#ef4444">데드크로스</b> 상태')
      +' (SMA20 '+(s.s20>s.s60?'>':'<')+' SMA60)<br>';
    if(s.s20) html+='• 현재가 SMA20 '+(cur>s.s20?'<b style="color:#22c55e">위</b> → 단기 상승':'<b style="color:#ef4444">아래</b> → 단기 조정');
    html+='</div></div>';
  }

  // 4. RSI
  if(rsi!==null&&rsi!==undefined){
    var rsiBar=Math.min(Math.max(rsi,0),100);
    html+='<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)">';
    html+='<div style="font-size:11px;font-weight:700;color:#a855f7;margin-bottom:6px">⚡ RSI (14일)</div>';
    html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">';
    html+='<div style="font-size:24px;font-weight:900;color:'+rsiC+'">'+rsi+'</div>';
    html+='<div style="flex:1"><div style="height:7px;background:var(--s1);border-radius:3px;position:relative;overflow:hidden">';
    html+='<div style="position:absolute;inset:0;background:linear-gradient(to right,#22c55e 30%,#f59e0b 60%,#ef4444);opacity:.4"></div>';
    html+='<div style="position:absolute;top:0;left:'+rsiBar+'%;width:3px;height:100%;background:'+rsiC+';border-radius:2px;transform:translateX(-50%)"></div>';
    html+='</div><div style="display:flex;justify-content:space-between;font-size:9px;color:#4b5563;margin-top:2px"><span>0</span><span>30</span><span>50</span><span>70</span><span>100</span></div></div></div>';
    html+='<div style="font-size:12px;color:#c5d5e0">• RSI '+rsi+' → <b style="color:'+rsiC+'">'+rsiL+'</b><br>';
    if(rsi<30) html+='→ 30 이하 과매도. 기술적 반등 확률 높음 (단, 강한 하락 추세 중엔 추가 하락 가능)';
    else if(rsi>70) html+='→ 70 이상 과매수. 단기 조정 주의 (단, 강한 상승 추세 중엔 지속 가능)';
    else html+='→ 구조론 기능선 신호와 함께 종합 판단';
    html+='</div></div>';
  }

  // 5. MACD
  if(mac){
    var mc=mac.hist>0?'#22c55e':'#ef4444';
    html+='<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)">';
    html+='<div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:6px">📊 MACD (12, 26, 9)</div>';
    html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px">';
    html+=_chip('MACD',    mac.line>0?'+'+mac.line:mac.line,   mac.line>0?'#22c55e':'#ef4444');
    html+=_chip('시그널',  mac.signal>0?'+'+mac.signal:mac.signal, '#60a5fa');
    html+=_chip('히스토그램', mac.hist>0?'+'+mac.hist:mac.hist, mc);
    html+='</div><div style="font-size:12px;color:#c5d5e0">';
    html+='• '+(mac.hist>0?'<b style="color:#22c55e">MACD > 시그널</b> → 매수 모멘텀':'<b style="color:#ef4444">MACD < 시그널</b> → 매도 모멘텀')+'<br>';
    html+='• 히스토그램 '+( Math.abs(mac.hist)>Math.abs(mac.line)*0.15?'확대 → 모멘텀 가속':'축소 → 모멘텀 약화, 추세 전환 주의');
    html+='</div></div>';
  }

  // 6. 볼린저
  if(bb){
    var bpct=bb.upper-bb.lower>0?Math.round((cur-bb.lower)/(bb.upper-bb.lower)*100):50;
    var bw=Math.round((bb.upper-bb.lower)/bb.middle*100);
    html+='<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)">';
    html+='<div style="font-size:11px;font-weight:700;color:#06b6d4;margin-bottom:6px">📏 볼린저 밴드 (20일, ±2σ)</div>';
    html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px">';
    html+=_chip('상단',      fp(Math.round(bb.upper)),  '#ef4444');
    html+=_chip('중선(SMA20)',fp(Math.round(bb.middle)), '#6b7280');
    html+=_chip('하단',      fp(Math.round(bb.lower)),  '#22c55e');
    html+='</div>';
    html+='<div style="height:7px;background:linear-gradient(to right,#22c55e,#6b7280,#ef4444);border-radius:3px;position:relative;margin-bottom:5px">';
    html+='<div style="position:absolute;top:-2px;left:'+Math.min(Math.max(bpct,1),99)+'%;width:5px;height:11px;background:#fff;border-radius:2px;transform:translateX(-50%)"></div>';
    html+='</div>';
    html+='<div style="font-size:12px;color:#c5d5e0">';
    if(cur>=bb.upper*0.97) html+='• 밴드 상단 근처 → 과매수 또는 강한 상승. 단기 조정 주의<br>';
    else if(cur<=bb.lower*1.03) html+='• 밴드 하단 근처 → 과매도 또는 강한 하락. 반등 탐색<br>';
    else if(cur>bb.middle) html+='• 중선 위 — 상승 편향<br>';
    else html+='• 중선 아래 — 하락 편향<br>';
    html+='• 밴드 폭 '+bw+'% '+(bw<8?'<b style="color:#f97316">극도 수렴 → 큰 이탈 임박</b>':bw<15?'수렴 → 방향 탐색 중':'확대 → 추세 강함, 변동성 큼');
    html+='</div></div>';
  }

  // 7. 캔들 패턴
  if(cdl&&cdl.name!=='봉 데이터 부족'){
    var cc=cdl.sentiment==='bullish'?'#22c55e':cdl.sentiment==='bearish'?'#ef4444':'#6b7280';
    html+='<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)">';
    html+='<div style="font-size:11px;font-weight:700;color:#f97316;margin-bottom:6px">🕯 최근 캔들 패턴</div>';
    html+='<div style="margin-bottom:4px"><span style="padding:3px 10px;background:'+cc+'18;border:1px solid '+cc+'44;border-radius:10px;font-size:12px;font-weight:700;color:'+cc+'">'+cdl.name+'</span></div>';
    html+='<div style="font-size:12px;color:#c5d5e0">• '+cdl.desc+'</div></div>';
  }

  // 8. 거래량
  if(vol.cur&&vol.avg){
    var vr=Math.round(vol.cur/vol.avg*10)/10;
    var vc=vr>2?'#f59e0b':vr>1.2?'#22c55e':'#6b7280';
    html+='<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)">';
    html+='<div style="font-size:11px;font-weight:700;color:#84cc16;margin-bottom:6px">📊 거래량</div>';
    html+='<div style="font-size:12px;color:#c5d5e0">• 평균 대비 <b style="color:'+vc+'">'+vr+'배</b><br>';
    if(vr>2) html+='→ 거래량 급증 — 수급 집중. 방향 확인 필수';
    else if(vr>1.2) html+='→ 거래량 증가 — 참여자 증가. 추세 신뢰도 상승';
    else if(vr<0.6) html+='→ 거래량 감소 — 매도 압력 약화. 눌림·반등 구간에선 긍정적';
    else html+='→ 거래량 보통 — 방향 확인 필요';
    html+='</div></div>';
  }

  // 9. 종합 의견
  var sum=[];
  if(ind.trend==='up') sum.push('MA 정배열 상승 추세');
  else if(ind.trend==='down') sum.push('MA 역배열 하락 추세');
  else sum.push('MA 혼조 (방향 탐색)');
  // MA 분석 카드
  if(s.s20){
    var cross5_20=s.s5?(s.s5>s.s20?'단기 골든크로스(5MA↑>20MA)':'단기 데드크로스(5MA↓<20MA)'):'';
    var cross20_60=s.s60?(s.s20>s.s60?'중기 골든크로스(20MA↑>60MA)':'중기 데드크로스(20MA↓<60MA)'):'';
    var maTxt=(cross5_20?'<b style="color:'+(s.s5>s.s20?'#22c55e':'#ef4444')+'">'+cross5_20+'</b>  ':'')
      +(cross20_60?'<b style="color:'+(s.s20>s.s60?'#22c55e':'#ef4444')+'">'+cross20_60+'</b>':'')+'<br>'
      +(s.s5?'5일선 <b style="color:'+(cur>s.s5?'#22c55e':'#ef4444')+'">'+fp(Math.round(s.s5))+'</b> &nbsp;':'')
      +(s.s20?'20일선 <b style="color:'+(cur>s.s20?'#22c55e':'#ef4444')+'">'+fp(Math.round(s.s20))+'</b>'+(devs.s20?'(이격 '+(devs.s20>0?'+':'')+devs.s20.toFixed(1)+'%)'  :'')+'&nbsp;':'')
      +(s.s60?'60일선 <b style="color:'+(cur>s.s60?'#22c55e':'#ef4444')+'">'+fp(Math.round(s.s60))+'</b>'+(devs.s60?'(이격 '+(devs.s60>0?'+':'')+devs.s60.toFixed(1)+'%)':''):'')+'<br>'
      +(slopes.s20>0.3?'20일선 <b style="color:#22c55e">우상향</b>(+'+slopes.s20.toFixed(1)+'%/주) — 중기 상승 추세 강화.':slopes.s20<-0.3?'20일선 <b style="color:#ef4444">우하향</b>('+slopes.s20.toFixed(1)+'%/주) — 중기 하락 추세 강화.':'20일선 횡보 — 방향 탐색.')+'<br>'
      +(cur>s.s20&&s.s60&&s.s20>s.s60?'현재가가 20·60일선 모두 위 → <b style="color:#22c55e">정배열 구조</b>, 중기 상승 추세 유효.':
         cur<s.s20&&s.s60&&s.s20<s.s60?'현재가가 20·60일선 모두 아래 → <b style="color:#ef4444">역배열 구조</b>, 중기 하락 추세 유효.':
         cur>s.s20&&s.s60&&s.s20<s.s60?'현재가>20일선 but 20일선<60일선(데드크로스 속) → <b style="color:#f59e0b">단기 반등 중, 추세 전환인지 확인 필요</b>.':
         '현재가<20일선 but 20일선>60일선(골든크로스 속) → <b style="color:#f59e0b">단기 조정, 20일선 회복 여부 주목</b>.');
    html+=taCard('📈 이동평균선(MA) 분석','#60a5fa',maTxt);
  }
  // RSI + 다이버전스
  if(rsi!==null&&rsi!==undefined){
    var rsiBar=Math.min(Math.max(rsi,0),100);
    var rsiZone=rsi<30?'<b style="color:#22c55e">과매도 — 기술적 반등 확률 높음</b> (단, 강한 하락 추세 중엔 추가 하락 가능)':
                rsi>70?'<b style="color:#ef4444">과매수 — 단기 차익 실현 압력</b> (단, 강한 상승 추세 중엔 지속 가능)':
                rsi<45?'중립 하방 — 매도 압력 약간 우세. 50 회복이 관건':
                rsi>55?'중립 상방 — 매수 우위 약간. 70 돌파 시 과열 주의':'중립(45~55) — 방향 탐색 중';
    var divTxt=rsiDiv==='bullish'?'<br><b style="color:#22c55e">★ 강세 다이버전스 감지</b> — 가격은 신저점 경신 중이나 RSI 저점은 오히려 상승. 상승 반전 선행 신호.':
               rsiDiv==='bearish'?'<br><b style="color:#ef4444">★ 약세 다이버전스 감지</b> — 가격은 신고점 경신 중이나 RSI 고점은 오히려 하락. 하락 반전 선행 신호.':'';
    var rsiVis='<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">'
      +'<div style="font-size:28px;font-weight:900;color:'+rsiC+'">'+rsi+'</div>'
      +'<div style="flex:1"><div style="height:8px;background:var(--s1);border-radius:4px;position:relative;overflow:hidden">'
      +'<div style="position:absolute;inset:0;background:linear-gradient(to right,#22c55e 30%,#f59e0b 60%,#ef4444);opacity:.35"></div>'
      +'<div style="position:absolute;top:-1px;left:'+rsiBar+'%;width:4px;height:10px;background:'+rsiC+';border-radius:2px;transform:translateX(-50%)"></div>'
      +'</div><div style="display:flex;justify-content:space-between;font-size:10px;color:#4b5563;margin-top:2px"><span>0</span><span style="color:#22c55e">30</span><span>50</span><span style="color:#ef4444">70</span><span>100</span></div></div></div>';
    html+=taCard('⚡ RSI(14일) 분석','#a855f7',rsiVis+rsiZone+divTxt);
  }
  // MACD + 크로스
  if(mac){
    var mc=mac.hist>0?'#22c55e':'#ef4444';
    var crossTxt=macdCross==='golden'?'<b style="color:#22c55e">★ MACD 골든크로스 발생</b> — MACD가 시그널 위로 상향 돌파. 매수 전환 신호.<br>':
                 macdCross==='dead'?'<b style="color:#ef4444">★ MACD 데드크로스 발생</b> — MACD가 시그널 아래로 하향 돌파. 매도 전환 신호.<br>':'';
    var macVis='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">'
      +_chip('MACD',(mac.line>0?'+':'')+mac.line,mac.line>0?'#22c55e':'#ef4444')
      +_chip('시그널',(mac.signal>0?'+':'')+mac.signal,'#60a5fa')
      +_chip('히스토그램',(mac.hist>0?'+':'')+mac.hist,mc)+'</div>';
    var macdTxt=(mac.hist>0?'<b style="color:#22c55e">MACD > 시그널</b> → 매수 모멘텀 형성':'<b style="color:#ef4444">MACD < 시그널</b> → 매도 모멘텀 형성')+'<br>'
      +(Math.abs(mac.hist)>Math.abs(mac.line)*0.15?'히스토그램 확대 → 모멘텀 가속 중':'히스토그램 축소 → 모멘텀 약화, 추세 전환 주의')+'<br>'
      +(mac.line>0?'MACD 라인 0선 위 → 중기 상승 추세 확인':'MACD 라인 0선 아래 → 중기 하락 추세 확인');
    html+=taCard('📊 MACD(12,26,9) 분석','#f59e0b',macVis+crossTxt+macdTxt);
  }
  // 볼린저 밴드
  if(bb){
    var bpct=bb.upper-bb.lower>0?Math.round((cur-bb.lower)/(bb.upper-bb.lower)*100):50;
    var bw=Math.round((bb.upper-bb.lower)/bb.middle*100);
    var bVis='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">'
      +_chip('상단',fp(Math.round(bb.upper)),'#ef4444')+_chip('중선(SMA20)',fp(Math.round(bb.middle)),'#6b7280')+_chip('하단',fp(Math.round(bb.lower)),'#22c55e')+'</div>'
      +'<div style="height:8px;background:linear-gradient(to right,#22c55e,#6b7280,#ef4444);border-radius:4px;position:relative;margin-bottom:8px">'
      +'<div style="position:absolute;top:-2px;left:'+Math.min(Math.max(bpct,1),99)+'%;width:6px;height:12px;background:#fff;border-radius:3px;transform:translateX(-50%)"></div></div>';
    var bTxt=(cur>=bb.upper*0.97?'<b style="color:#ef4444">밴드 상단 근처</b> — 단기 과매수 또는 강한 상승 추세. 상단 돌파 시 추세 가속, 접촉 반락 시 단기 매도 고려.':
             cur<=bb.lower*1.03?'<b style="color:#22c55e">밴드 하단 근처</b> — 단기 과매도 또는 강한 하락. 반등 탐색 구간, 이탈 시 추가 하락 주의.':
             cur>bb.middle?'중선('+fp(Math.round(bb.middle))+') 위 — 상승 편향. 상단('+fp(Math.round(bb.upper))+')까지 추가 여지.':
             '중선('+fp(Math.round(bb.middle))+') 아래 — 하락 편향. 하단('+fp(Math.round(bb.lower))+')까지 주의.')+'<br>'
      +(bw<8?'<b style="color:#f97316">극도 수렴(폭 '+bw+'%) — 큰 방향성 이탈 임박.</b> 이탈 방향이 다음 추세.':
         bw<15?'밴드 수렴(폭 '+bw+'%) — 방향 탐색 중. 수렴 완성 후 큰 움직임 예상.':
         '밴드 확대(폭 '+bw+'%) — 추세 강함, 변동성 큼.');
    html+=taCard('📏 볼린저 밴드(20일, ±2σ)','#06b6d4',bVis+bTxt);
  }
  // 캔들 + 다중봉 패턴
  var cdlBody='';
  if(multi){var mc3=multi.sentiment==='bullish'?'#22c55e':'#ef4444'; cdlBody+='<b style="color:'+mc3+'">3봉 패턴: '+multi.name+'</b><br>'+multi.desc+'<br><br>';}
  if(cdl&&cdl.name&&cdl.name!=='봉 데이터 부족'){var cc3=cdl.sentiment==='bullish'?'#22c55e':cdl.sentiment==='bearish'?'#ef4444':'#6b7280'; cdlBody+='<b style="color:'+cc3+'">최근 봉: '+cdl.name+'</b><br>'+cdl.desc;}
  if(cdlBody) html+=taCard('🕯 캔들 패턴 분석','#f97316',cdlBody);
  // 차트 패턴
  if(patterns.length){
    html+=taCard('🔍 차트 패턴 감지','#8b5cf6',patterns.map(function(pt){
      var pc=pt.type==='bullish'?'#22c55e':pt.type==='bearish'?'#ef4444':'#6b7280';
      return '<b style="color:'+pc+'">'+pt.name+'</b><br>'+pt.desc;
    }).join('<br><br>'));
  }
  // 거래량 + OBV
  if(vol.cur&&vol.avg){
    var vr=Math.round(vol.cur/vol.avg*10)/10;
    var vTxt=(vr>2?'<b style="color:#f59e0b">거래량 급증('+vr+'배)</b> — 수급 집중. 방향 확인 필수. 거래량 동반 돌파/이탈은 신뢰도 크게 높음.':
              vr>1.2?'<b style="color:#22c55e">거래량 증가('+vr+'배)</b> — 참여자 증가. 현재 방향 추세 신뢰도 상승.':
              vr<0.6?'<b style="color:#9ca3af">거래량 감소('+vr+'배)</b> — 참여자 관망. 눌림·반등 구간에서는 에너지 재충전 신호(긍정적). 돌파 시 거래량 동반 확인 필수.':
              '거래량 보통('+vr+'배) — 추세 확인 중.')
      +(obvTrend==='up'?'<br><b style="color:#22c55e">OBV(누적거래량) 상승</b> — 가격 선행 자금 유입 확인. 상승 추세 뒷받침.':
        obvTrend==='down'?'<br><b style="color:#ef4444">OBV(누적거래량) 하락</b> — 가격 선행 자금 이탈. 하락 추세 뒷받침.':'');
    html+=taCard('📊 거래량 & OBV 분석','#84cc16',vTxt);
  }
  // 종합 기술적 의견
  var bullets=[];
  if(s.s20&&s.s60) bullets.push(s.s20>s.s60?'<b style="color:#22c55e">MA 정배열(골든크로스)</b> — 중기 상승 추세 유효.':'<b style="color:#ef4444">MA 역배열(데드크로스)</b> — 중기 하락 추세 유효.');
  if(rsi!==null){if(rsi<35)bullets.push('<b style="color:#22c55e">RSI '+rsi+' 과매도</b> — 기술적 반등 신호.');else if(rsi>65)bullets.push('<b style="color:#ef4444">RSI '+rsi+' 과매수</b> — 조정 주의.');}
  if(rsiDiv==='bullish')bullets.push('<b style="color:#22c55e">RSI 강세 다이버전스</b> — 상승 반전 선행 신호.');
  if(rsiDiv==='bearish')bullets.push('<b style="color:#ef4444">RSI 약세 다이버전스</b> — 하락 반전 선행 신호.');
  if(macdCross==='golden')bullets.push('<b style="color:#22c55e">MACD 골든크로스</b> — 매수 전환.');
  if(macdCross==='dead')bullets.push('<b style="color:#ef4444">MACD 데드크로스</b> — 매도 전환.');
  else if(mac)bullets.push('MACD 히스토그램 '+(mac.hist>0?'<b style="color:#22c55e">+'+mac.hist+' 매수 모멘텀</b>':'<b style="color:#ef4444">'+mac.hist+' 매도 모멘텀</b>')+'.');
  if(bb){if(cur<=bb.lower*1.03)bullets.push('<b style="color:#22c55e">볼린저 하단 접근</b> — 과매도 반등 구간.');else if(cur>=bb.upper*0.97)bullets.push('<b style="color:#ef4444">볼린저 상단 접근</b> — 과매수 조정 주의.');}
  if(multi)bullets.push('<b style="color:#f97316">'+multi.name+'</b> — '+multi.desc.split('.')[0]+'.');
  else if(cdl&&cdl.name!=='봉 데이터 부족')bullets.push('<b style="color:#f97316">'+cdl.name+'</b> — '+cdl.desc.split('.')[0]+'.');
  patterns.forEach(function(pt){bullets.push('<b style="color:#8b5cf6">'+pt.name+'</b> — '+pt.desc.split('.')[0]+'.'); });
  if(obvTrend==='up')bullets.push('<b style="color:#22c55e">OBV 상승</b> — 가격 선행 자금 유입.');
  if(obvTrend==='down')bullets.push('<b style="color:#ef4444">OBV 하락</b> — 가격 선행 자금 이탈.');
  // 종합 의견은 buildTechSummaryCard()에서 별도 렌더링
  html+='</div>';
  return html;
}

// ── 기술적 종합 요약 카드 (최상단 표시용) ──
function buildTechSummaryCard(ind, cur, fp){
  if(!ind) return '';
  var rsi=ind.rsi, mac=ind.macd, bb=ind.bb, s=ind.sma||{};
  var rsiDiv=ind.rsiDiv, macdCross=ind.macdCross, obvTrend=ind.obvTrend;
  var multi=ind.multiCandle, cdl=ind.candle, patterns=ind.patterns||[];

  var items=[], pos=0, neg=0;

  // MA
  if(s.s20&&s.s60){
    if(s.s20>s.s60){items.push({t:'MA 정배열 (골든크로스) — 중기 상승 추세 유효',c:'#22c55e',ok:true});pos++;}
    else{items.push({t:'MA 역배열 (데드크로스) — 중기 하락 추세',c:'#ef4444',ok:false});neg++;}
  }
  if(s.s5&&s.s20){
    if(s.s5>s.s20){items.push({t:'단기 골든크로스 (5MA>20MA)',c:'#22c55e',ok:true});pos++;}
    else{items.push({t:'단기 데드크로스 (5MA<20MA)',c:'#ef4444',ok:false});neg++;}
  }
  // RSI
  if(rsi!==null&&rsi!==undefined){
    if(rsi<30){items.push({t:'RSI '+rsi+' 과매도 — 기술적 반등 확률 높음',c:'#22c55e',ok:true});pos++;}
    else if(rsi<45){items.push({t:'RSI '+rsi+' 저권역 — 매수 우위',c:'#22c55e',ok:true});pos++;}
    else if(rsi>70){items.push({t:'RSI '+rsi+' 과매수 — 단기 조정 주의',c:'#ef4444',ok:false});neg++;}
    else if(rsi>60){items.push({t:'RSI '+rsi+' 상승권 — 과열 주의',c:'#f59e0b',ok:false});}
    else{items.push({t:'RSI '+rsi+' 중립 — 방향 탐색',c:'#6b7280',ok:true});pos+=0.5;}
  }
  if(rsiDiv==='bullish'){items.push({t:'★ RSI 강세 다이버전스 — 상승 반전 선행',c:'#22c55e',ok:true});pos+=1.5;}
  if(rsiDiv==='bearish'){items.push({t:'★ RSI 약세 다이버전스 — 하락 반전 선행',c:'#ef4444',ok:false});neg+=1.5;}
  // MACD
  if(macdCross==='golden'){items.push({t:'★ MACD 골든크로스 — 매수 전환',c:'#22c55e',ok:true});pos+=1.5;}
  else if(macdCross==='dead'){items.push({t:'★ MACD 데드크로스 — 매도 전환',c:'#ef4444',ok:false});neg+=1.5;}
  else if(mac){
    if(mac.hist>0&&mac.line>0){items.push({t:'MACD 양권+히스토 플러스 — 매수 모멘텀',c:'#22c55e',ok:true});pos++;}
    else if(mac.hist>0){items.push({t:'MACD 히스토그램 개선 — 반전 준비',c:'#22c55e',ok:true});pos+=0.7;}
    else{items.push({t:'MACD 음권 — 하락 모멘텀',c:'#ef4444',ok:false});neg++;}
  }
  // 볼린저
  if(bb&&cur){
    if(cur<=bb.lower*1.03){items.push({t:'볼린저 하단 접근 — 과매도 반등 구간',c:'#22c55e',ok:true});pos++;}
    else if(cur>=bb.upper*0.97){items.push({t:'볼린저 상단 접근 — 과매수 조정 주의',c:'#f59e0b',ok:false});}
    var bw=bb.middle>0?Math.round((bb.upper-bb.lower)/bb.middle*100):0;
    if(bw<8){items.push({t:'볼린저 극도 수렴 (폭 '+bw+'%) — 큰 이탈 임박',c:'#f97316',ok:true});pos+=0.5;}
  }
  // OBV
  if(obvTrend==='up'){items.push({t:'OBV 상승 — 가격 선행 자금 유입',c:'#22c55e',ok:true});pos++;}
  if(obvTrend==='down'){items.push({t:'OBV 하락 — 가격 선행 자금 이탈',c:'#ef4444',ok:false});neg++;}
  // 캔들
  if(multi){var mc3=multi.sentiment==='bullish'?'#22c55e':'#ef4444';items.push({t:multi.name+' — '+multi.desc.split('.')[0],c:mc3,ok:multi.sentiment==='bullish'});if(multi.sentiment==='bullish')pos++;else neg++;}
  else if(cdl&&cdl.name&&cdl.name!=='봉 데이터 부족'){var cc3=cdl.sentiment==='bullish'?'#22c55e':cdl.sentiment==='bearish'?'#ef4444':'#6b7280';items.push({t:cdl.name+' — '+cdl.desc.split('.')[0],c:cc3,ok:cdl.sentiment==='bullish'});if(cdl.sentiment==='bullish')pos++;else if(cdl.sentiment==='bearish')neg++;}
  // 차트 패턴
  patterns.forEach(function(pt){
    var pc=pt.type==='bullish'?'#22c55e':pt.type==='bearish'?'#ef4444':'#8b5cf6';
    items.push({t:pt.name+' — '+pt.desc.split('.')[0],c:pc,ok:pt.type==='bullish'});
    if(pt.type==='bullish')pos++;else if(pt.type==='bearish')neg++;
  });

  if(!items.length) return '';

  var total=pos+neg, strength=total>0?Math.round(pos/total*100):50;
  var sC=strength>=70?'#22c55e':strength>=45?'#f59e0b':'#ef4444';
  var sL=strength>=70?'강세 ↑':strength>=45?'중립':'약세 ↓';

  var h='<div style="margin-bottom:14px;background:var(--bg);border:1.5px solid '+sC+'33;border-radius:14px;overflow:hidden">';
  // 헤더 바
  h+='<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:'+sC+'0d;border-bottom:1px solid '+sC+'22">';
  h+='<div style="font-size:14px;font-weight:800;color:var(--tx)">📊 기술적 종합 요약</div>';
  h+='<div style="display:flex;align-items:center;gap:10px">';
  h+='<div style="font-size:11px;color:#6b7280">긍정 '+Math.floor(pos)+' / 부정 '+Math.floor(neg)+'</div>';
  h+='<div style="padding:3px 12px;border-radius:20px;background:'+sC+'22;border:1px solid '+sC+';font-size:13px;font-weight:800;color:'+sC+'">'+sL+' '+strength+'%</div>';
  h+='</div></div>';
  // 신호 목록 (2열 그리드)
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;padding:10px 14px">';
  items.forEach(function(item){
    h+='<div style="display:flex;align-items:flex-start;gap:6px;padding:5px 4px;border-bottom:1px solid rgba(255,255,255,.04)">';
    h+='<span style="color:'+item.c+';font-size:13px;flex-shrink:0;margin-top:1px">'+(item.ok?'▲':'▼')+'</span>';
    h+='<span style="font-size:11px;color:#c5d5e0;line-height:1.5">'+item.t+'</span>';
    h+='</div>';
  });
  h+='</div></div>';
  return h;
}

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
  } else if(d.indicators && d.indicators.sma && d.indicators.sma.s20){
    // 박스/도지 미감지 시 보조지표(SMA/볼린저) 기반 전략
    var _i=d.indicators, _s20=Math.round(_i.sma.s20), _s60=_i.sma.s60?Math.round(_i.sma.s60):Math.round(_s20*0.95);
    var _bbU=_i.bb?Math.round(_i.bb.upper):Math.round(_s20*1.05), _bbL=_i.bb?Math.round(_i.bb.lower):Math.round(_s20*0.95);
    if(d.structure==='trend-up'){
      posStr='상승 추세 — SMA 눌림 구간';
      recommendation='20일/60일 이평 기반 눌림 매수 전략';
      finalJudge=p<=_s20*1.01?'매수 가능 (SMA20 눌림 진입)':'대기 (SMA20 눌림 대기)';
      scenarios=['시나리오 A: SMA20('+fp(_s20)+') 지지 확인 → 재상승 → 볼린저 상단('+fp(_bbU)+') 목표',
                 '시나리오 B: SMA20 이탈 → SMA60('+fp(_s60)+') 재확인 → SMA60 이탈 시 즉시 손절'];
      entries=['1차: SMA20 '+fp(_s20)+' 근처', '2차: SMA60 '+fp(_s60)+' (추가 조정 시)'];
      stopLoss='SMA60('+fp(_s60)+') 아래 종가 이탈 시 즉시 손절';
      targets=['1차: 볼린저 상단 '+fp(_bbU), '2차: 직전 고점'];
    } else if(d.structure==='trend-down'){
      posStr='하락 추세 — SMA 반등 매도 구간';
      recommendation='20일/60일 이평 기반 반등 매도 전략';
      finalJudge=p>=_s20*0.99?'매도 가능 (SMA20 반등 매도)':'대기 (SMA20 반등 대기)';
      scenarios=['시나리오 A: SMA20('+fp(_s20)+') 저항 확인 → 재하락 → 볼린저 하단('+fp(_bbL)+') 목표',
                 '시나리오 B: SMA20 돌파 → SMA60('+fp(_s60)+') 재확인 → SMA60 돌파 시 즉시 손절'];
      entries=['1차: SMA20 '+fp(_s20)+' 근처', '2차: SMA60 '+fp(_s60)+' (추가 반등 시)'];
      stopLoss='SMA60('+fp(_s60)+') 위 종가 돌파 시 즉시 손절';
      targets=['1차: 볼린저 하단 '+fp(_bbL), '2차: 직전 저점'];
    } else {
      posStr='횡보 — 볼린저 밴드 기준 박스 구간';
      recommendation='볼린저 밴드 하단 매수 / 상단 매도 전략';
      finalJudge=p<=_bbL*1.02?'매수 가능 (볼린저 하단 근처)':p>=_bbU*0.98?'매도 가능 (볼린저 상단 근처)':'대기 (중립 구간)';
      scenarios=['시나리오 A: 볼린저 하단('+fp(_bbL)+') 지지 → SMA20 회복 → 상단('+fp(_bbU)+') 목표',
                 '시나리오 B: 볼린저 하단 이탈 → SMA20 -3% 손절'];
      entries=['1차: 볼린저 하단 '+fp(_bbL)+' 근처', '2차: 하단 -1% 추가 진입'];
      stopLoss='볼린저 하단('+fp(_bbL)+') -2% 이탈 시 손절';
      targets=['1차: SMA20 '+fp(_s20)+' (중선)', '2차: 볼린저 상단 '+fp(_bbU)];
    }
  } else {
    posStr='기능선 미특정'; recommendation='박스 경계 또는 도지 상단/종가/하단을 입력해 주세요.';
    finalJudge='무포지션 (기능선 미특정)';
  }

  // 사건봉 추가
  if(ec){ (p>=ec ? supportC : resistC).push('사건봉 종가 '+fp(ec)+'(대량거래 합의)'); }

  // ── 진입/손절/익절 가격 추출 ──
  var ind = d.indicators || {};
  var _indS = ind.sma || {}, _indRsi = ind.rsi, _indMac = ind.macd, _indBb = ind.bb;
  var indTxt = []; // 보조지표 매수/매도 근거 텍스트

  // 보조지표 신호 수집
  if(_indRsi!==null&&_indRsi!==undefined){
    if(_indRsi<35) indTxt.push('RSI '+_indRsi+' 과매도 → 기술적 반등 신호');
    else if(_indRsi>65) indTxt.push('RSI '+_indRsi+' 과매수 → 단기 조정 신호');
  }
  if(_indMac){ if(_indMac.hist>0) indTxt.push('MACD 히스토그램 플러스 → 매수 모멘텀'); else indTxt.push('MACD 히스토그램 마이너스 → 매도 모멘텀'); }
  if(_indBb){ if(d.currentPrice<=_indBb.lower*1.02) indTxt.push('볼린저 하단 근처 → 과매도'); else if(d.currentPrice>=_indBb.upper*0.98) indTxt.push('볼린저 상단 근처 → 과매수'); }
  if(_indS.s20){ if(d.currentPrice>_indS.s20) indTxt.push('현재가>SMA20 → 단기 상승'); else indTxt.push('현재가<SMA20 → 단기 하락'); }

  var _rnd2 = function(v){ return Math.round(v*100)/100; };
  var e1p=0,e1r='', e2p=0,e2r='', slp=0,slr='', t1p=0,t1r='', t2r='';
  var isBuyA = true; // 항상 매수 관점으로 표시
  var _slBuf = 0.985; // 손절 버퍼 1.5% (2차 매수가와 구분)
  var _slBufS = 1.015; // 매도 손절 버퍼 (위로)

  // 지표 기반 가격 (박스/도지 미감지 시 폴백용)
  var _ind2=d.indicators||{}, _s2=(_ind2.sma||{});
  var _s20v=_s2.s20?Math.round(_s2.s20):0, _s60v=_s2.s60?Math.round(_s2.s60):0;
  var _bbUv=_ind2.bb?Math.round(_ind2.bb.upper):0, _bbLv=_ind2.bb?Math.round(_ind2.bb.lower):0;

  if(hasDoji){
    if(p>=dl && p<=du){
      if(p<=dc){
        e1p=dc;
        e1r='도지 종가('+fp(dc)+') = 압축된 전장의 합의가격. 다수 참여자가 이 가격에서 포지션 형성 → 하단 눌림 시 매수세 재유입 가능성 높음.'
          +(indTxt.length?' 보조지표 신호: '+indTxt.join(' / '):'');
        e2p=dl;
        e2r='도지 하단('+fp(dl)+') = 매수세가 강하게 반응했던 경계선. 이 가격까지 내려오면 매수세 강하게 반응할 가능성 높음. 1차보다 더 유리한 가격 진입.';
        slp=_rnd2(dl*_slBuf);
        slr='도지 하단('+fp(dl)+') 종가 기준 이탈 시 → 지지가 저항으로 전환. 진입 근거(도지 내부 지지) 완전 소멸. 즉시 손절('+fp(slp)+', 하단 -1.5% 기준), 새 이유 붙이기 금지.';
        t1p=du; t1r='도지 상단('+fp(du)+') = 매도세 경계. 종가 돌파 실패 시 1차 익절. 돌파 성공 시 다음 기능선까지 보유.';
        t2r='도지 상단 종가 돌파 후 다음 외부 저항 기능선까지 추가 보유';
      } else {
        // 도지 내부 상단~종가: 종가까지 내려오면 매수
        e1p=dc;
        e1r='도지 종가('+fp(dc)+') = 도지 내부 균형점. 현재가가 도지 상단 근처이므로 종가로 눌릴 때 1차 매수 타점.'
          +(indTxt.length?' 보조지표: '+indTxt.join(' / '):'');
        e2p=dl;
        e2r='도지 하단('+fp(dl)+') = 매수세 경계선. 더 깊이 눌릴 경우 2차 매수 타점.';
        slp=_rnd2(dl*_slBuf);
        slr='도지 하단('+fp(dl)+') 종가 이탈 시(실제 손절: '+fp(slp)+') → 도지 지지 붕괴. 즉시 손절.';
        t1p=du; t1r='도지 상단('+fp(du)+') = 1차 익절 목표.';
        t2r='도지 상단 돌파 후 다음 기능선까지 보유';
      }
    } else if(p>du){
      e1p=du;
      e1r='도지 상단('+fp(du)+')이 저항→지지로 전환. 과거 매도 압력이 있던 자리가 돌파 후 지지로 기억됨 → 리테스트 1차 매수 타점.'
        +(indTxt.length?' 보조지표: '+indTxt.join(' / '):'');
      e2p=dc;
      e2r='도지 종가('+fp(dc)+') = 도지 합의가격. 도지 상단 지지가 무너질 경우 이 가격까지 추가 조정 → 더 유리한 2차 매수 타점.';
      slp=_rnd2(dl*_slBuf);
      slr='도지 하단('+fp(dl)+') 아래('+fp(slp)+') 종가 이탈 시 → 도지 구조 완전 붕괴. 상방 돌파 논리 소멸 → 즉시 전량 손절.';
      t1r='직전 고점 또는 다음 저항 기능선 — 종가 돌파 실패 시 1차 익절';
      t2r='추세 가속 후 다음 기능선까지 보유';
    } else {
      // 도지 하단 아래: 과매도 반등 매수 타점
      e1p=dl;
      e1r='도지 하단('+fp(dl)+') = 과매도 구간. 하단 아래에서 반등 기대 1차 매수 타점. 종가 기준 도지 내부 복귀 확인 필요.'
        +(indTxt.length?' 보조지표: '+indTxt.join(' / '):'');
      e2p=Math.round(dl*0.97);
      e2r='도지 하단 -3%('+fp(Math.round(dl*0.97))+') = 추가 하락 시 더 유리한 2차 매수 타점.';
      slp=_rnd2(dl*0.955);
      slr='도지 하단('+fp(dl)+') 기준 -4.5%('+fp(slp)+') 이탈 시 → 반등 실패. 즉시 손절.';
      t1p=dc; t1r='도지 종가('+fp(dc)+') 회복 시 1차 익절.';
      t2r='도지 상단('+fp(du)+') 도달 시 2차 익절';
    }
  } else if(hasBox){
    if(p>=bl && p<=bc){
      e1p=bc;
      e1r='박스 종가 클러스터('+fp(bc)+') = 박스 내 다수 종가가 집중된 합의가격대. 많은 참여자의 평균 매수가 → 매수세 재유입 가능성 높음.'
        +(indTxt.length?' 보조지표: '+indTxt.join(' / '):'');
      e2p=bl;
      e2r='박스 하단('+fp(bl)+') = 매수세와 매도세가 균형을 이루는 경계선. 이 가격에서 과거 강한 매수 반응 → 더 유리한 진입. 분할 매수 원칙 적용.';
      slp=_rnd2(bl*_slBuf);
      slr='박스 하단('+fp(bl)+') 종가 이탈 시(실제 손절: '+fp(slp)+') → 지지가 저항으로 전환. 진입 근거(박스 하단 매수) 완전 소멸 → 즉시 손절. 새 이유 붙이기 절대 금지.';
      t1p=bu; t1r='박스 상단('+fp(bu)+') = 매도세 우위 구간. 종가 기준 돌파 실패 시 1차 익절, 돌파 성공 시 다음 기능선까지 보유.';
      t2r='박스 상단 종가 돌파 후 추세매매로 전환, 다음 저항 기능선까지 보유';
    } else if(p>bc&&p<=bu){
      // 박스 종가~상단: 박스 종가로 눌릴 때 매수
      e1p=bc;
      e1r='박스 종가 클러스터('+fp(bc)+') = 박스 내 합의가격. 상단 근처에서 종가로 눌릴 때 1차 매수 타점.'
        +(indTxt.length?' 보조지표: '+indTxt.join(' / '):'');
      e2p=bl;
      e2r='박스 하단('+fp(bl)+') = 매수세 경계선. 더 깊이 조정 시 2차 매수 타점.';
      slp=_rnd2(bl*_slBuf);
      slr='박스 하단('+fp(bl)+') 종가 이탈 시(실제 손절: '+fp(slp)+') → 지지 붕괴. 즉시 손절.';
      t1p=bu; t1r='박스 상단('+fp(bu)+') = 1차 익절 목표. 돌파 성공 시 추세매매 전환.';
      t2r='박스 상단 종가 돌파 후 다음 기능선까지 보유';
    } else if(p>bu){
      e1p=bu;
      e1r='박스 상단('+fp(bu)+')이 저항→지지로 전환. 과거 매도 압력이 있던 자리 → 돌파 후 매수세의 기억. 눌림매매 1차 타점.'
        +(indTxt.length?' 보조지표: '+indTxt.join(' / '):'');
      e2p=bc;
      e2r='박스 종가('+fp(bc)+') = 박스 합의가격. 상단 지지가 무너질 경우 이 가격까지 추가 조정 → 더 유리한 2차 매수 타점.';
      slp=_rnd2(bc*_slBuf);
      slr='박스 종가('+fp(bc)+') 아래('+fp(slp)+') 종가 이탈 시 → 눌림 실패, 박스 내부 복귀. 진입 근거 소멸 → 즉시 손절.';
      t1r='직전 고점 또는 다음 저항 기능선 — 종가 돌파 실패 시 1차 익절';
      t2r='추세 가속 후 다음 기능선까지 보유';
    } else {
      // 박스 하단 아래: 과매도 반등 매수 타점
      e1p=bl;
      e1r='박스 하단('+fp(bl)+') = 과매도 구간 진입. 박스 하단 아래에서 반등 기대 1차 매수 타점. 박스 내부 복귀(종가 기준) 확인 필요.'
        +(indTxt.length?' 보조지표: '+indTxt.join(' / '):'');
      e2p=Math.round(bl*0.97);
      e2r='박스 하단 -3%('+fp(Math.round(bl*0.97))+') = 추가 하락 시 더 유리한 2차 매수 타점.';
      slp=_rnd2(bl*0.955);
      slr='박스 하단('+fp(bl)+') 기준 -4.5%('+fp(slp)+') 이탈 시 → 반등 실패. 즉시 손절.';
      t1p=bc; t1r='박스 종가('+fp(bc)+') 회복 시 1차 익절.';
      t2r='박스 상단('+fp(bu)+') 도달 시 2차 익절';
    }
  } else if(_s20v){
    // 박스/도지 미감지 → 보조지표 기반 가격 설정
    if(isBuyA){
      e1p=_s20v; e1r='SMA20('+fp(_s20v)+') = 20일 이동평균 지지선. 단기 상승 추세 기준선 — 눌림 1차 매수 타점.';
      e2p=_s60v||Math.round(_s20v*0.96); e2r='SMA60('+fp(_s60v||Math.round(_s20v*0.96))+') = 60일 이평 지지선 — 더 깊은 조정 시 2차 매수 타점.';
      slp=_s60v?Math.round(_s60v*0.985):Math.round(_s20v*0.965);
      slr='SMA60('+fp(_s60v)+') 아래 종가 이탈 → 중기 상승 추세 붕괴. 즉시 손절.';
      t1p=_bbUv||Math.round(_s20v*1.06); t1r='볼린저 상단('+fp(_bbUv||Math.round(_s20v*1.06))+') = 단기 과매수 구간. 1차 익절 타점.';
      t2r='볼린저 상단 돌파 후 다음 저항까지 보유';
    } else {
      // 하락 추세에서도 반등 매수 타점 제시
      var bbMid = _bbLv ? Math.round((_bbUv+_bbLv)/2) : Math.round(_s20v*0.98);
      e1p=_bbLv||Math.round(_s20v*0.96); e1r='볼린저 하단('+fp(e1p)+') 근처 = 하락 추세 중 과매도 반등 1차 매수 타점. RSI 과매도 동반 시 신뢰도 상승.';
      e2p=_bbLv?Math.round(_bbLv*0.97):Math.round(_s20v*0.93); e2r='볼린저 하단 -3% = 추가 하락 시 더 유리한 가격 2차 매수 타점.';
      slp=_bbLv?Math.round(_bbLv*0.96):Math.round(_s20v*0.90);
      slr='볼린저 하단 추가 이탈('+fp(slp)+') → 반등 실패. 즉시 손절.';
      t1p=bbMid; t1r='볼린저 중선(SMA20, '+fp(bbMid)+') 회복 시 1차 익절.';
      t2r=(_bbUv?fp(_bbUv):'')+' 볼린저 상단 도달 시 2차 익절';
    }
  }

  // ── 최종 폴백: 어떤 경우에도 가격이 항상 표시되도록 ──
  if(!e1p&&_s20v){ e1p=_s20v; e1r='SMA20 기반 진입 타점'; }
  if(!e2p){ e2p=_s60v?_s60v:Math.round((e1p||_s20v)*0.97); e2r='SMA60 또는 1차 진입가 -3% 타점'; }
  if(!slp){ slp=Math.round((e2p||e1p||_s20v)*(_bbLv&&_bbLv<(e2p||_s20v)?1:_slBuf)); slr='2차 진입가 기준 -1.5% 손절'; }
  if(!t1p){ t1p=_bbUv?_bbUv:Math.round((e1p||_s20v)*1.05); t1r='볼린저 상단 또는 +5% 1차 익절 목표'; }

  // ── 보조지표로 각 가격 타점 근거 강화 ──
  if(d.indicators && e1p){
    var _i=d.indicators, _rsi=_i.rsi, _mac=_i.macd, _bb2=_i.bb, _s3=_i.sma||{};
    var _vol2=_i.vol||{}, _cdl2=_i.candle, _mCross=_i.macdCross, _rDiv=_i.rsiDiv;

    // ─ 1차 매수가: 어떤 지표가 이 가격을 지지하는가 ─
    var e1ind=[];
    if(_rsi!==null&&_rsi!==undefined){
      if(_rsi<30)       e1ind.push('RSI '+_rsi+' 극과매도 → 기술적 반등 확률 매우 높음');
      else if(_rsi<40)  e1ind.push('RSI '+_rsi+' 과매도 → 저점 매수 우위 구간');
      else if(_rsi<50)  e1ind.push('RSI '+_rsi+' 중립 하방 → 추가 조정 시 과매도 진입 예상');
      else if(_rsi>65)  e1ind.push('RSI '+_rsi+' 과열권 → 조정 후 진입 권장');
    }
    if(_rDiv==='bullish') e1ind.push('RSI 강세 다이버전스 → 상승 반전 선행 신호 (매수 강력 지지)');
    if(_mCross==='golden') e1ind.push('MACD 골든크로스 발생 → 매수 모멘텀 전환');
    else if(_mac&&_mac.hist>0&&_mac.line>0) e1ind.push('MACD 양권 → 매수 모멘텀 확인');
    else if(_mac&&_mac.hist<0&&_mac.hist>(_mac.signal||0)*0.5) e1ind.push('MACD 히스토그램 개선 중 → 반전 준비');
    if(_bb2&&e1p&&e1p<=_bb2.lower*1.04) e1ind.push('볼린저 하단('+fp(Math.round(_bb2.lower))+') 근처 → 과매도 구간 진입');
    else if(_bb2&&e1p) e1ind.push('볼린저 밴드 내 위치 → 상단('+fp(Math.round(_bb2.upper))+')까지 여지 있음');
    if(_s3.s20&&_s3.s60&&_s3.s20>_s3.s60) e1ind.push('MA 정배열(SMA20>SMA60) → 중기 상승 추세 유효');
    if(_vol2.cur&&_vol2.avg&&_vol2.cur<_vol2.avg*0.65) e1ind.push('거래량 감소 → 눌림 중 매도 압력 약화');
    if(_cdl2&&_cdl2.sentiment==='bullish') e1ind.push('캔들: '+_cdl2.name+' → 매수 반응 신호');
    if(_i.patterns&&_i.patterns.length){
      var bullPt=_i.patterns.filter(function(pt){return pt.type==='bullish';});
      if(bullPt.length) e1ind.push('차트패턴: '+bullPt.map(function(p){return p.name.split(' ')[0];}).join('·'));
    }
    if(e1ind.length) e1r = e1r + '\n→ 지표 근거: '+e1ind.slice(0,3).join(' / ');

    // ─ 2차 매수가: 더 깊은 조정 시 지표 상황 ─
    var e2ind=[];
    if(_rsi!==null&&_rsi!==undefined){
      if(_rsi<40) e2ind.push('RSI '+_rsi+' → 2차 진입 시 더 유리한 과매도 구간 진입');
      else e2ind.push('RSI '+_rsi+' → 추가 조정 시 '+Math.round(_rsi*0.85)+' 수준 하락 예상, 과매도 진입 가능');
    }
    if(_vol2.cur&&_vol2.avg&&_vol2.cur<_vol2.avg*0.65) e2ind.push('거래량 감소 지속 시 매도 압력 완전 소진 확인');
    if(_bb2) e2ind.push('볼린저 하단('+fp(Math.round(_bb2.lower))+') 근처 또는 이탈 구간 → 강한 반등 포인트');
    if(e2ind.length) e2r = e2r + '\n→ 지표 근거: '+e2ind.slice(0,2).join(' / ');

    // ─ 손절가: 어떤 지표가 함께 무너지는가 ─
    var slind=[];
    if(_s3.s60&&slp&&slp<=_s3.s60*1.01) slind.push('SMA60('+fp(Math.round(_s3.s60))+') 동반 이탈 → 중기 상승 추세 완전 붕괴');
    if(_bb2&&slp&&slp<=_bb2.lower*0.99) slind.push('볼린저 하단('+fp(Math.round(_bb2.lower))+') 이탈 → 과매도 구간 돌파, 급락 위험');
    if(_s3.s20&&slp&&slp<_s3.s20) slind.push('SMA20('+fp(Math.round(_s3.s20))+') 하향 이탈 → 단기 추세 전환');
    slind.push('진입 근거(구조론 지지) 소멸 → 즉시 전량 청산, 새 이유 절대 금지');
    slr = slr + '\n→ 손절 근거: '+slind.slice(0,3).join(' / ');

    // ─ 1차 익절가: 어떤 저항이 기다리는가 ─
    var t1ind=[];
    if(_bb2&&t1p&&t1p>=_bb2.upper*0.96) t1ind.push('볼린저 상단('+fp(Math.round(_bb2.upper))+') = 단기 과매수 경계, 도달 시 조정 주의');
    if(_s3.s20&&t1p&&Math.abs(t1p-_s3.s20)/_s3.s20<0.03) t1ind.push('SMA20('+fp(Math.round(_s3.s20))+') 저항선 근처');
    if(_rsi!==null&&_rsi!==undefined) t1ind.push('익절 도달 시 예상 RSI: '+(Math.min(75,(_rsi||50)+20))+' 내외 (과매수 주의)');
    t1ind.push('종가 기준 돌파 실패 시 1차 익절 / 돌파 성공 시 다음 기능선까지 보유');
    if(t1ind.length) t1r = t1r + '\n→ 익절 근거: '+t1ind.slice(0,3).join(' / ');
  }

  // ── % 계산 (기준: 1차 진입가) ──
  var slPct   = e1p&&slp  ? _pct(e1p, slp)  : '';
  var e2Diff  = e1p&&e2p  ? _pct(e1p, e2p)  : '';
  var tgt1Pct = e1p&&t1p  ? _pct(e1p, t1p)  : '';
  var rr1     = e1p&&slp&&t1p ? _rr(e1p,slp,t1p) : '';

  // ── 지표 기반 포지션 전략 (핵심 추가) ──
  var posStrategy = (function(){
    var ind = d.indicators;
    if(!ind) return null;
    var rsi=ind.rsi, mac=ind.macd, bb=ind.bb, s=ind.sma||{};
    var posSize=100, signals=[], condEntry='', adjNote='';

    if(isBuyA){
      // RSI → 포지션 비중 조정
      if(rsi!==null&&rsi!==undefined){
        if(rsi<25)      { posSize=100; signals.push({t:'✅ RSI '+rsi+' 극도 과매도 — 기술적 반등 확률 매우 높음. 표준 비중 100% 진입.',c:'#22c55e'}); }
        else if(rsi<35) { posSize=100; signals.push({t:'✅ RSI '+rsi+' 과매도 — 반등 확률 높음. 1차 100% 진입.',c:'#22c55e'}); }
        else if(rsi<50) { posSize=90;  signals.push({t:'📊 RSI '+rsi+' 중립 하방 — 1차 90% 진입, RSI 40 이하 추가 시 2차 분할.',c:'#6b7280'}); }
        else if(rsi<60) { posSize=75;  signals.push({t:'⚠ RSI '+rsi+' 중립 상방 — 1차 75%만 진입. RSI 50 이하 조정 시 2차 추가.',c:'#f59e0b'}); condEntry='RSI 50 이하로 조정 시 2차 매수 검토'; }
        else if(rsi<70) { posSize=50;  signals.push({t:'⚠ RSI '+rsi+' 과열권 — 1차 50%만 진입. 단기 조정 후 2차 추가 권장.',c:'#f59e0b'}); condEntry='RSI 55 이하 조정 확인 후 2차 진입'; }
        else            { posSize=30;  signals.push({t:'❌ RSI '+rsi+' 과매수 — 매수 시점으로 부적합. 비중 30% 제한 또는 대기.',c:'#ef4444'}); condEntry='RSI 65 이하 충분히 조정된 후 진입 재검토'; }
      }
      // MACD → 타이밍 조정
      if(mac){
        if(mac.hist>0&&mac.line>0)       { signals.push({t:'✅ MACD 양전환(골든크로스) — 매수 모멘텀 확인. 예정 비중 유지.',c:'#22c55e'}); }
        else if(mac.hist>0&&mac.line<0)  { signals.push({t:'📊 MACD 히스토그램 개선 중 — 전환 준비. 1차 진입 유효.',c:'#6b7280'}); }
        else if(mac.hist<0&&mac.line<0)  { posSize=Math.round(posSize*0.7); signals.push({t:'⚠ MACD 음권 — 하락 모멘텀 지속. 비중 70%로 축소. 히스토그램 개선 후 추가.',c:'#f59e0b'}); condEntry=(condEntry?condEntry+' / ':'')+'MACD 히스토그램 플러스 전환 후 잔여 비중 추가'; }
      }
      // MA 배열 → 추세 확인
      if(s.s20&&s.s60){
        if(s.s20>s.s60) { signals.push({t:'✅ MA 정배열(SMA20>SMA60) — 중기 상승 추세 유효. 비중 유지.',c:'#22c55e'}); }
        else             { posSize=Math.round(posSize*0.65); signals.push({t:'❌ MA 역배열(SMA20<SMA60) — 추세 역행 매수. 비중 65%로 제한. 추세 전환 확인 후 추가.',c:'#ef4444'}); }
      }
      // 볼린저밴드 → 과매도/과매수
      if(bb&&p>0){
        if(p<=bb.lower*1.02)  { signals.push({t:'✅ 볼린저 하단 근처 — 과매도 구간 진입. 매수 신뢰도 강화. 비중 유지.',c:'#22c55e'}); }
        if(p>=bb.upper*0.98)  { posSize=Math.round(posSize*0.5); signals.push({t:'❌ 볼린저 상단 근처 — 단기 과매수. 비중 50%로 제한.',c:'#ef4444'}); }
      }
    } else {
      // 매도 포지션
      if(rsi!==null&&rsi!==undefined){
        if(rsi>70)      { posSize=100; signals.push({t:'✅ RSI '+rsi+' 과매수 — 매도 신뢰도 높음. 표준 비중.',c:'#22c55e'}); }
        else if(rsi>60) { posSize=75;  signals.push({t:'📊 RSI '+rsi+' 상승권 — 1차 75% 매도.',c:'#6b7280'}); }
        else if(rsi<35) { posSize=30;  signals.push({t:'❌ RSI '+rsi+' 과매도 — 매도 위험 구간. 30%만 진입.',c:'#ef4444'}); condEntry='RSI 45 이상 반등 후 매도 재검토'; }
      }
      if(mac&&mac.hist<0) { signals.push({t:'✅ MACD 하락 모멘텀 확인 — 매도 신뢰도 강화.',c:'#22c55e'}); }
      if(s.s20&&s.s60&&s.s20<s.s60) { signals.push({t:'✅ MA 역배열 — 하락 추세 확인, 매도 유리.',c:'#22c55e'}); }
      if(bb&&p>0&&p<=bb.lower*1.02) { posSize=Math.round(posSize*0.5); signals.push({t:'⚠ 볼린저 하단 근처 — 과매도 구간. 매도 비중 50%로 제한.',c:'#f59e0b'}); }
    }

    posSize = Math.max(10, Math.min(100, posSize));
    var sizeColor = posSize>=80?'#22c55e':posSize>=50?'#f59e0b':'#ef4444';
    return {posSize:posSize, sizeColor:sizeColor, signals:signals, condEntry:condEntry};
  })();

  // ── 출력 빌더 ──
  var color  = finalJudge.includes('매수')?'#22c55e':finalJudge.includes('매도')?'#ef4444':'#f59e0b';
  var bgC    = finalJudge.includes('매수')?'rgba(34,197,94,.15)':finalJudge.includes('매도')?'rgba(239,68,68,.15)':'rgba(245,158,11,.15)';
  var structLabel = (d.structure==='box'?'📦 박스':d.structure==='trend-up'?'📈 상승 추세':'📉 하락 추세')+' | '+grade;
  var dojiTypeText = d.dojiType==='strength'?'추세강화도지':d.dojiType==='reversal'?'추세반전도지':'';
  var fLines=[];
  if(du) fLines.push(fp(du)+' (도지 상단)');
  if(dc) fLines.push(fp(dc)+' (도지 종가 ★합의)');
  if(dl) fLines.push(fp(dl)+' (도지 하단)');
  if(bu) fLines.push(fp(bu)+' (박스 상단)');
  if(bc&&hasBox) fLines.push(fp(bc)+' (박스 종가)');
  if(bl) fLines.push(fp(bl)+' (박스 하단)');
  if(ec) fLines.push(fp(ec)+' (사건봉 종가)');

  var eC  = isBuyA ? '#22c55e' : '#ef4444';
  var eIC = isBuyA ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)';
  var eL1 = isBuyA ? '🟢 1차 매수' : '🔴 1차 매도';
  var eL2 = isBuyA ? '🟢 2차 매수' : '🔴 2차 매도';

  // ── 가격 테이블 (세로형) ──
  function ptRow(label,lCol, price,pCol, pct,pctCol, desc){
    return '<div style="display:grid;grid-template-columns:110px 1fr 72px;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.05)">'
    +'<div style="font-size:13px;font-weight:800;color:'+lCol+'">'+label+'</div>'
    +'<div><div style="font-size:21px;font-weight:900;color:'+(pCol||'var(--tx)')+';line-height:1.2">'+( price ? fp(price) : '—' )+'</div>'
    +(desc?'<div style="font-size:11px;color:#6b7280;margin-top:3px">'+desc+'</div>':'')
    +'</div>'
    +'<div style="text-align:right;font-size:14px;font-weight:800;color:'+(pctCol||'#6b7280')+'">'+( pct||'' )+'</div>'
    +'</div>';
  }

  // 근거 텍스트 렌더링 헬퍼 (\n → <br>, 지표 근거 파란색 강조)
  function renderReason(txt){
    if(!txt) return '';
    return txt.replace(/\n→ ([^:]+:)/g, function(_,g){ return '<br><span style="color:#60a5fa;font-size:10px;font-weight:700">→ '+g+'</span>'; })
      .replace(/\n/g,'<br>');
  }

  var priceSummary =
  '<div style="margin-bottom:16px;border-radius:14px;overflow:hidden;border:1px solid var(--bd)">'
  // 헤더
  +'<div style="display:grid;grid-template-columns:110px 1fr 72px;padding:10px 16px;background:var(--s1);border-bottom:1px solid var(--bd)">'
  +'<div style="font-size:12px;font-weight:700;color:#6b7280">구분</div>'
  +'<div style="font-size:12px;font-weight:700;color:#6b7280">가격</div>'
  +'<div style="font-size:12px;font-weight:700;color:#6b7280;text-align:right">기준 대비</div>'
  +'</div>'
  // 1차 진입
  +'<div style="display:grid;grid-template-columns:110px 1fr 72px;align-items:flex-start;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.05)">'
  +'<div style="font-size:13px;font-weight:800;color:'+eC+';padding-top:4px">'+eL1+'</div>'
  +'<div><div style="font-size:21px;font-weight:900;color:var(--tx);line-height:1.2;margin-bottom:4px">'+(e1p?fp(e1p):'—')+'</div>'
  +'<div style="font-size:12px;color:#c9d1d9;line-height:1.7">'+renderReason(e1r)+'</div></div>'
  +'<div style="text-align:right;font-size:14px;font-weight:800;color:#9ca3af;padding-top:4px">기준가</div>'
  +'</div>'
  // 2차 진입
  +'<div style="display:grid;grid-template-columns:110px 1fr 72px;align-items:flex-start;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.05)">'
  +'<div style="font-size:13px;font-weight:800;color:'+(isBuyA?'#4ade80':'#f87171')+';padding-top:4px">'+eL2+'</div>'
  +'<div><div style="font-size:21px;font-weight:900;color:var(--tx);line-height:1.2;margin-bottom:4px">'+(e2p?fp(e2p):'—')+'</div>'
  +'<div style="font-size:12px;color:#c9d1d9;line-height:1.7">'+renderReason(e2r)+'</div></div>'
  +'<div style="text-align:right;font-size:14px;font-weight:800;color:'+(e2Diff&&parseFloat(e2Diff)<0?'#22c55e':'#9ca3af')+';padding-top:4px">'+(e2Diff||'')+'</div>'
  +'</div>'
  // 손절가
  +'<div style="display:grid;grid-template-columns:110px 1fr 72px;align-items:flex-start;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(239,68,68,.05)">'
  +'<div style="font-size:13px;font-weight:800;color:#ef4444;padding-top:4px">⛔ 손절가</div>'
  +'<div><div style="font-size:21px;font-weight:900;color:#ef4444;line-height:1.2;margin-bottom:4px">'+(slp?fp(slp):'—')+'</div>'
  +'<div style="font-size:12px;color:#c9d1d9;line-height:1.7">'+renderReason(slr)+'</div></div>'
  +'<div style="text-align:right;font-size:14px;font-weight:800;color:#ef4444;padding-top:4px">'+(slPct||'')+'</div>'
  +'</div>'
  // 1차 익절
  +'<div style="display:grid;grid-template-columns:110px 1fr 72px;align-items:flex-start;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(59,130,246,.05)">'
  +'<div style="font-size:13px;font-weight:800;color:#60a5fa;padding-top:4px">🎯 1차 익절</div>'
  +'<div><div style="font-size:21px;font-weight:900;color:#60a5fa;line-height:1.2;margin-bottom:4px">'+(t1p?fp(t1p):'—')+'</div>'
  +'<div style="font-size:12px;color:#c9d1d9;line-height:1.7">'+renderReason(t1r)+'</div></div>'
  +'<div style="text-align:right;font-size:14px;font-weight:800;color:#60a5fa;padding-top:4px">'+(tgt1Pct||'')+'</div>'
  +'</div>'
  // 푸터 (R:R + 2차 목표)
  +'<div style="padding:10px 16px;background:var(--s1);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">'
  +(rr1?'<div style="font-size:14px"><span style="color:#6b7280">리스크:리워드</span> <span style="font-weight:900;color:var(--tx)">R:R '+rr1+'</span></div>':'<div></div>')
  +(t2r?'<div style="font-size:12px;color:#c9d1d9">2차 목표: '+t2r+'</div>':'')
  +'</div>'
  +'</div>';

  // ── 시나리오 ──
  var scenarioCards = scenarios.length ? '<div style="margin-bottom:16px">'
  +'<div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:10px">📋 매매 시나리오</div>'
  + scenarios.map(function(s,i){
    var isA=i===0;
    return '<div style="padding:14px 16px;border-radius:10px;border-left:4px solid '+(isA?'#22c55e':'#ef4444')+';background:'+(isA?'rgba(34,197,94,.08)':'rgba(239,68,68,.08)')+';margin-bottom:8px">'
    +'<div style="font-size:14px;font-weight:800;color:'+(isA?'#22c55e':'#ef4444')+';margin-bottom:5px">'+(isA?'✅ 성공 — 시나리오 A':'❌ 실패 — 시나리오 B')+'</div>'
    +'<div style="font-size:13px;color:var(--tx);line-height:1.7">'+s.replace(/^시나리오 [AB][^:]*: /,'')+'</div>'
    +'</div>';
  }).join('')
  +'</div>' : '';

  // ── 핵심 기능선 ──
  var funcLines = fLines.length?'<div style="margin-bottom:16px">'
  +'<div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:10px">📍 핵심 기능선'+(dojiTypeText?' &nbsp;<span style="font-size:12px;color:#f59e0b;font-weight:600">'+dojiTypeText+'</span>':'')+'</div>'
  +'<div style="display:flex;flex-wrap:wrap;gap:8px">'
  +fLines.map(function(l){ return '<span style="background:var(--s2);border:1.5px solid var(--bd);border-radius:8px;padding:7px 14px;font-size:13px;color:var(--tx);font-weight:700">'+l+'</span>'; }).join('')
  +'</div></div>':'';

  return '<div style="background:var(--s2);border-radius:16px;border:1px solid var(--bd);padding:20px;margin-top:4px">'

  // 최종 판단 배너
  +'<div style="padding:16px 18px;border-radius:12px;background:'+bgC+';border:2px solid '+color+';margin-bottom:20px;display:flex;align-items:center;gap:14px">'
  +'<div style="font-size:30px;flex-shrink:0">🏁</div>'
  +'<div style="flex:1">'
  +'<div style="font-size:22px;font-weight:900;color:'+color+'">'+finalJudge+'</div>'
  +'<div style="font-size:13px;color:var(--mt);margin-top:5px">'+structLabel+' &nbsp;|&nbsp; 현재가 '+(p?'<b style="color:var(--tx)">'+fp(p)+'</b>':'미입력')+' — '+posStr+'</div>'
  +'</div></div>'

  // ── 기술적 종합 요약 (최상단) ──
  + buildTechSummaryCard(d.indicators, p, fp)

  // 가격 테이블
  + priceSummary

  // 지표 기반 포지션 전략 카드
  +(posStrategy ? (function(){
    var ps=posStrategy;
    var html='<div style="margin-bottom:16px;background:var(--bg);border-radius:12px;border:1px solid rgba(255,255,255,.1);padding:16px">';
    html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
    html+='<div style="font-size:15px;font-weight:800;color:var(--tx)">📊 지표 기반 포지션 전략</div>';
    html+='<div style="text-align:right">';
    html+='<div style="font-size:11px;color:#6b7280;margin-bottom:2px">권장 포지션 비중</div>';
    html+='<div style="font-size:24px;font-weight:900;color:'+ps.sizeColor+'">'+ps.posSize+'%</div>';
    html+='</div></div>';
    // 진행 바
    html+='<div style="height:8px;background:var(--s2);border-radius:4px;overflow:hidden;margin-bottom:12px">';
    html+='<div style="height:100%;width:'+ps.posSize+'%;background:'+ps.sizeColor+';border-radius:4px;transition:width .3s"></div>';
    html+='</div>';
    // 신호 목록
    ps.signals.forEach(function(s){
      html+='<div style="font-size:12px;color:var(--tx);padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);line-height:1.5">'+s.t+'</div>';
    });
    // 조건부 진입
    if(ps.condEntry){
      html+='<div style="margin-top:10px;padding:10px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:8px;font-size:12px;color:#f59e0b">';
      html+='⏳ <b>조건부 진입:</b> '+ps.condEntry+'</div>';
    }
    html+='</div>';
    return html;
  })() : '')

  // 근거 분석
  + buildReasonCard(d, fp, d.indicators||{}, isBuyA, (d.indicators||{}).patterns||[])

  // 시나리오
  + scenarioCards

  // 기능선
  + funcLines

  // 거래량/갭/지지저항 요약
  +'<div style="padding:12px 16px;background:var(--bg);border-radius:10px;border:1px solid rgba(255,255,255,.06);margin-bottom:4px">'
  +'<div style="font-size:13px;color:#c5d5e0;line-height:2.1">'
  +'<div><span style="font-size:12px;font-weight:700;color:#9ca3af;min-width:54px;display:inline-block">거래량</span>'+volText+'</div>'
  +(gapText?'<div><span style="font-size:12px;font-weight:700;color:#9ca3af;min-width:54px;display:inline-block">갭</span>'+gapText+'</div>':'')
  +(supportC.length?'<div><span style="font-size:12px;font-weight:700;color:#22c55e;min-width:54px;display:inline-block">지지</span>'+supportC.slice(0,2).join(' / ')+'</div>':'')
  +(resistC.length?'<div><span style="font-size:12px;font-weight:700;color:#ef4444;min-width:50px;display:inline-block">저항</span>'+resistC.slice(0,2).join(' &nbsp;/&nbsp; ')+'</div>':'')
  +(d.note?'<div><span style="font-size:12px;font-weight:700;color:#9ca3af;min-width:50px;display:inline-block">참고</span>'+d.note+'</div>':'')
  +'</div></div>'

  +'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;flex-wrap:wrap;gap:8px">'
  +'<div style="font-size:12px;color:#4b5563">⚠ 구조론 기반 시나리오 — 투자 결정은 반드시 본인이 최종 판단하세요.</div>'
  +'<button id="ct-save-btn" onclick="window._ctSaveAnalysis()" style="padding:8px 16px;background:var(--ac);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">💾 분석 저장</button>'
  +'</div>'
  +'</div>'
  + buildTechSection(d.indicators, p, fp);
}

// ── 뉴스 fetch ──
async function fetchNews(ticker){
  try {
    var resp = await fetch('/api/news?symbol='+encodeURIComponent(ticker), {signal: AbortController ? (function(){ var c=new AbortController(); setTimeout(function(){c.abort();},10000); return c.signal; })() : undefined});
    if(!resp || !resp.ok) return [];
    var data = await resp.json();
    return data.news || [];
  } catch(e){ return []; }
}

// ── 뉴스 감성 분류 ──
function classifyNews(title){
  var pos = /상승|급등|돌파|성장|호재|개선|증가|흑자|호조|신고점|계약|수주|강세|반등|신기록|surge|gain|jump|rise|beat|growth|record|buy|upgrade|positive|strong|rally|profit/i;
  var neg = /하락|급락|이탈|손실|적자|부진|악화|감소|신저점|취소|위기|우려|경고|약세|추락|fall|drop|decline|miss|loss|concern|risk|sell|downgrade|weak|warning|deficit|cut/i;
  if(pos.test(title)) return 'pos';
  if(neg.test(title)) return 'neg';
  return 'neu';
}

// ── 뉴스 카드 빌더 ──
function buildNewsCard(news){
  if(!news || !news.length) return '';
  var now = Math.floor(Date.now()/1000);
  var timeAgo = function(ts){
    var diff = now - ts;
    if(diff < 3600)   return Math.floor(diff/60)+'분 전';
    if(diff < 86400)  return Math.floor(diff/3600)+'시간 전';
    if(diff < 604800) return Math.floor(diff/86400)+'일 전';
    return new Date(ts*1000).toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
  };
  var badgeMap = {
    pos: {bg:'rgba(34,197,94,.12)',  border:'#22c55e', color:'#22c55e', label:'호재'},
    neg: {bg:'rgba(239,68,68,.12)', border:'#ef4444', color:'#ef4444', label:'악재'},
    neu: {bg:'rgba(156,163,175,.1)', border:'#4b5563', color:'#6b7280', label:'중립'}
  };
  return '<div style="margin-top:14px;background:var(--s2);border-radius:12px;border:1px solid var(--bd);padding:16px">'
  +'<div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:12px">📰 최근 뉴스 (호재 / 악재)</div>'
  + news.slice(0,8).map(function(n){
    var cls = classifyNews(n.title);
    var b = badgeMap[cls];
    return '<a href="'+n.link+'" target="_blank" rel="noopener" style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05);text-decoration:none;cursor:pointer">'
    +'<div style="flex-shrink:0;margin-top:2px">'
    +'<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:800;background:'+b.bg+';border:1px solid '+b.border+';color:'+b.color+'">'+b.label+'</span>'
    +'</div>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:12px;color:var(--tx);line-height:1.5;margin-bottom:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+n.title+'</div>'
    +'<div style="font-size:10px;color:#4b5563">'+n.publisher+(n.publishedAt?' · '+timeAgo(n.publishedAt):'')+'</div>'
    +'</div>'
    +'</a>';
  }).join('')
  +'<div style="margin-top:8px;font-size:10px;color:#374151">⚠ 뉴스 감성은 키워드 기반 자동 분류입니다. 직접 확인하세요.</div>'
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
  +'.ct-card-body{font-size:13px;color:#c5d5e0;line-height:1.8}'
  +'.ct-step{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}'
  +'.ct-step-n{min-width:26px;height:26px;border-radius:50%;background:var(--ac);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
  +'.ct-step-c{font-size:12px;color:#c5d5e0}'
  +'.ct-step-t{font-weight:700;color:var(--tx);font-size:12px;margin-bottom:2px}'
  +'.ct-sym-bar{display:flex;gap:8px;margin-bottom:12px}'
  +'.ct-sym-in{flex:1;padding:9px 12px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-size:13px}'
  +'.ct-sym-btn{padding:9px 16px;background:var(--ac);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600}'
  // 2열 레이아웃 (PC)
  +'.ct-two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}'
  +'.ct-col-left{min-width:0;position:sticky;top:60px}'
  +'.ct-col-right{min-width:0}'
  // 히스토리 테이블
  +'.ct-hist-table{width:100%;border-collapse:collapse}'
  +'.ct-hist-table th,.ct-hist-table td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--bd);font-size:12px}'
  +'.ct-hist-table th{font-weight:700;color:#6b7280;background:var(--s1)}'
  +'.ct-hist-table td{color:var(--tx)}'
  +'.ct-hist-table tr:hover td{background:var(--s2)}'
  // 반응형
  +'@media(max-width:900px){.ct-two-col{grid-template-columns:1fr}}'
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
  var tabs=[
    {id:'chart',label:'📈 차트 분석'},
    {id:'analyze',label:'🔬 상세 입력'},
    {id:'history',label:'📋 분석 기록'},
    {id:'theory',label:'📚 이론 가이드'}
  ];
  return '<div class="ct-tab-bar">'
  +tabs.map(function(t){ return '<button class="ct-tab" data-t="'+t.id+'" onclick="window._ctSwitchTab(\''+t.id+'\')">'+t.label+'</button>'; }).join('')
  +'</div>';
}

function buildTabContent(){ return buildChartPane()+buildAnalyzePane()+buildHistoryPane()+buildTheoryPane(); }

// ── 차트 탭 ──
function buildChartPane(){
  return '<div class="ct-pane" data-pane="chart" style="display:none">'

  // 심볼 바
  +'<div class="ct-sym-bar" style="margin-bottom:10px">'
  +'<input id="ct-sym-input" class="ct-sym-in" placeholder="종목코드 (005930, AAPL)" value="005930" onkeydown="if(event.key===\'Enter\')window._ctChangeSymbol()">'
  +'<select id="ct-int-select" class="ct-sym-in" style="max-width:80px">'
  +'<option value="5">5분</option><option value="15">15분</option><option value="60">1시간</option>'
  +'<option value="D" selected>일봉</option><option value="W">주봉</option><option value="M">월봉</option>'
  +'</select>'
  +'<button class="ct-sym-btn" onclick="window._ctChangeSymbol()">분석</button>'
  +'</div>'

  // PC: 2열 레이아웃 (차트 왼쪽 | 분석 오른쪽)
  +'<div class="ct-two-col">'

  // 왼쪽: 차트
  +'<div class="ct-col-left">'
  +'<div id="ct-tv-box" style="height:480px;border-radius:12px;overflow:hidden;border:1px solid var(--bd);margin-bottom:8px"></div>'
  // 멀티 타임프레임 안내
  +'<div style="padding:10px 12px;background:var(--s2);border-radius:10px;border:1px solid var(--bd);font-size:11px;color:#6b7280">'
  +'💡 <b style="color:var(--tx)">멀티 타임프레임 분석 방법</b><br>'
  +'① 월봉(M) 선택 → 박스 경계 확인 (S급 기능선)<br>'
  +'② 주봉(W) 선택 → 추세 방향 확인 (A급 기능선)<br>'
  +'③ 일봉(D) 선택 → 진입 타점 확인 (B급 기능선)'
  +'</div>'
  +'</div>'

  // 오른쪽: 분석 결과
  +'<div class="ct-col-right">'
  +'<div id="ct-auto-output"></div>'
  +'</div>'

  +'</div>' // ct-two-col 닫기

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
  +'<option value="daily" selected>B급 — 일봉 (기본)</option><option value="weekly">A급 — 주봉</option>'
  +'<option value="monthly">S급 — 월봉 (가장 강함)</option><option value="h4">C급 — 4시간</option><option value="h1">C급 — 1시간</option>'
  +'</select>'
  +'<div style="font-size:10px;color:#4b5563;margin-top:4px">S급(월봉) &gt; A급(주봉) &gt; B급(일봉) &gt; C급(단기) — 현재 보고 있는 차트 봉 단위를 선택하세요</div>'
  +'</div>'
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

// ── 분석 기록 탭 ──
function buildHistoryPane(){
  return '<div class="ct-pane" data-pane="history" style="display:none;padding:16px">'

  // 매매 계산기
  +'<div style="background:var(--bg);border:1px solid var(--bd);border-radius:14px;padding:16px;margin-bottom:16px">'
  +'<div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:14px">⚖️ 매매 계산기</div>'
  +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">'
  +'<div><div style="font-size:11px;color:#6b7280;margin-bottom:4px">💰 계좌 크기</div>'
  +'<input id="ct-account" class="ct-input" type="number" placeholder="예: 5000000" oninput="window._ctCalcPosition()"></div>'
  +'<div><div style="font-size:11px;color:#6b7280;margin-bottom:4px">📊 포지션 비중 (%)</div>'
  +'<input id="ct-pos-pct" class="ct-input" type="number" value="75" min="1" max="100" oninput="window._ctCalcPosition()"></div>'
  +'<div><div style="font-size:11px;color:#6b7280;margin-bottom:4px">🌐 통화</div>'
  +'<select id="ct-calc-cur" class="ct-input" onchange="window._ctCalcPosition()">'
  +'<option value="KRW">🇰🇷 원화</option><option value="USD">🇺🇸 달러</option>'
  +'</select></div>'
  +'</div>'
  +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">'
  +'<div><div style="font-size:11px;color:#22c55e;margin-bottom:4px">🟢 진입가</div>'
  +'<input id="ct-calc-entry" class="ct-input" type="number" placeholder="매수가" oninput="window._ctCalcPosition()"></div>'
  +'<div><div style="font-size:11px;color:#ef4444;margin-bottom:4px">⛔ 손절가</div>'
  +'<input id="ct-calc-stop" class="ct-input" type="number" placeholder="손절가" oninput="window._ctCalcPosition()"></div>'
  +'<div><div style="font-size:11px;color:#60a5fa;margin-bottom:4px">🎯 1차 익절가</div>'
  +'<input id="ct-calc-target" class="ct-input" type="number" placeholder="익절가" oninput="window._ctCalcPosition()"></div>'
  +'</div>'
  +'<div id="ct-calc-result" style="font-size:13px;color:#6b7280">계좌 크기와 진입가를 입력하면 자동 계산됩니다.</div>'
  +'</div>'

  // 분석 기록
  +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
  +'<div style="font-size:15px;font-weight:800;color:var(--tx)">📋 분석 기록</div>'
  +'<button id="ct-save-btn" onclick="window._ctSaveAnalysis()" style="padding:8px 16px;background:var(--ac);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">💾 현재 분석 저장</button>'
  +'</div>'
  +'<div style="overflow-x:auto">'
  +'<table class="ct-hist-table"><thead><tr>'
  +'<th>날짜·시간</th><th>종목</th><th>진입가</th><th>지지~저항</th><th>구조</th><th>결과</th><th></th>'
  +'</tr></thead>'
  +'<tbody id="ct-hist-body"><tr><td colspan="7" style="text-align:center;color:#6b7280;padding:20px">불러오는 중...</td></tr></tbody>'
  +'</table>'
  +'</div>'
  +'</div>';
}

// ── 이론 가이드 탭 ──
function buildTheoryPane(){
  // ── 차트술사 구조론 주요 개념 ──
  var theoryCards = [
    {
      title:'📌 차트술사 구조론이란',
      color:'#f59e0b',
      body:'차트는 미래를 예언하는 도구가 아니다. 시장 참여자들이 실제로 돈을 넣고 싸운 <b>흔적을 기록한 역사책</b>이다.<br><br>'
        +'따라서 분석의 목적은 미래 가격을 맞히는 것이 아니다. 시장이 과거에 강하게 합의했던 가격을 찾고, 그 가격이 지금 지지로 작동할지 저항으로 작동할지 판정하는 것이다.<br><br>'
        +'<b>해석 순서:</b><br>체결 → 거래량 → 종가 → 사건봉 → 박스 → 도지 → 기능선 → 지지/저항 전환 → 박스매매 or 추세매매 → 진입·손절·익절 시나리오'
    },
    {
      title:'📦 박스와 추세',
      color:'#60a5fa',
      body:'차트는 <b>박스 → 추세 → 박스 → 추세</b>의 반복이다.<br><br>'
        +'<b>박스</b>: 매수·매도가 균형을 이루며 합의 가격을 찾는 구간<br>'
        +'  • 박스 상단 = 저항 (매도세 우위)<br>'
        +'  • 박스 하단 = 지지 (매수세 우위)<br>'
        +'  • 박스 내부 = 아직 방향 미결정<br><br>'
        +'<b>추세</b>: 하나의 박스에서 다음 박스로 이동하는 구간<br><br>'
        +'→ 박스 상단 <b>종가 기준</b> 돌파 = 상승 추세 가능성<br>'
        +'→ 박스 하단 <b>종가 기준</b> 이탈 = 하락 추세 가능성'
    },
    {
      title:'🔄 지지/저항 스위치 원리',
      color:'#22c55e',
      body:'지지와 저항은 별개의 선이 아니다. <b>하나의 가격대가 상황에 따라 역할을 바꾼다.</b><br><br>'
        +'<b>저항 → 지지 전환:</b><br>'
        +'  저항을 종가 기준으로 돌파 → 저항이 지지로 전환 → 되돌림 시 매수 타점<br><br>'
        +'<b>지지 → 저항 전환:</b><br>'
        +'  지지를 종가 기준으로 이탈 → 지지가 저항으로 전환 → 반등 시 매도 타점<br><br>'
        +'<b>핵심:</b> 가격이 선에 닿았는가가 아니라, <b>종가 기준으로 돌파/이탈했는가</b>가 중요하다.'
    },
    {
      title:'🕯 도지 = 압축된 박스',
      color:'#a855f7',
      body:'도지는 단순한 캔들 패턴이 아니다. <b>하위 프레임 횡보가 상위 프레임에서 압축된 박스</b>다.<br><br>'
        +'도지 상단 = 매도세 흔적 | 도지 하단 = 매수세 흔적 | 도지 종가 = 힘의 균형점<br><br>'
        +'<b>도지 내부시점 (박스매매):</b><br>'
        +'  • 도지 하단~종가 구간: 매수 우위, 손절=하단 종가 이탈<br>'
        +'  • 도지 종가~상단 구간: 매도 우위, 손절=상단 종가 돌파<br><br>'
        +'<b>도지 외부시점 (추세매매):</b><br>'
        +'  • 상단 돌파 후 되돌림: 도지 상단이 지지→ 1차 매수, 도지 종가→ 2차 매수<br>'
        +'  • 하단 이탈 후 반등: 도지 하단이 저항→ 1차 매도, 도지 종가→ 2차 매도'
    },
    {
      title:'⚡ 사건봉',
      color:'#f97316',
      body:'사건봉은 주변 봉들보다 거래량이 <b>비정상적으로 크게 증가</b>한 봉이다.<br><br>'
        +'사건봉은 단순히 큰 캔들이 아니다. 시장 참여자들의 자금이 집중적으로 충돌한 흔적이다.<br><br>'
        +'<b>가장 중요한 것은 사건봉 종가다.</b><br>'
        +'  • 상승 사건봉 종가 → 미래 지지 후보<br>'
        +'  • 하락 사건봉 종가 → 미래 저항 후보<br>'
        +'  • 꼬리 끝이 아니라 종가를 기준으로 판단한다.'
    },
    {
      title:'🎯 눌림매매 (핵심 매매 구조)',
      color:'#06b6d4',
      body:'<b>구조:</b> 축적 → 거래량 동반 돌파 → 조정(에너지 재충전) → 재상승<br><br>'
        +'<b>눌림매매 5가지 조건:</b><br>'
        +'  ① 기준 박스 존재<br>'
        +'  ② 거래량 동반 돌파<br>'
        +'  ③ 돌파 후 조정<br>'
        +'  ④ 조정 중 거래량 감소 (매도압력 약화 신호)<br>'
        +'  ⑤ 이전 저항이 지지로 전환 확인 후 진입<br><br>'
        +'<b>공포에 매수하라</b>의 의미: 저항을 돌파한 종목이 되돌림 과정에서 보여주는 공포에 매수하라.'
    },
    {
      title:'⛔ 손절 원칙',
      color:'#ef4444',
      body:'손절 기준은 명확하다. <b>진입 근거가 된 기능선을 종가 기준으로 재침범하면 실패다.</b><br><br>'
        +'<b>절대 하면 안 되는 행동:</b><br>'
        +'  • 근거가 깨졌는데 기다린다<br>'
        +'  • 새로운 이유를 만든다<br>'
        +'  • 다시 오를 것이라고 믿는다<br>'
        +'  • 다른 근거로 바꾼다<br><br>'
        +'<b>매매 실패의 본질은 가격이 하락한 것이 아니다. 내가 진입한 근거가 사라진 것이다.</b>'
    },
    {
      title:'💰 익절 원칙',
      color:'#22c55e',
      body:'익절은 고정 비율로 정하지 않는다. <b>다음 기능선까지의 이동으로 판단한다.</b><br><br>'
        +'<b>진입 전 설정:</b> 1차 목표가 / 2차 목표가 / 상위 저항선 / 격이 높은 기능선<br><br>'
        +'<b>익절 판단:</b><br>'
        +'  • 목표 기능선 도달 후 종가 기준 돌파 실패 → 익절 고려<br>'
        +'  • 목표 기능선 종가 기준 돌파 성공 → 다음 기능선까지 보유'
    },
  ];

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
    {
      g:'S급', f:'월봉', c:'#f59e0b',
      why:'월봉 하나는 약 20거래일(한 달)의 모든 매매가 압축된 것. 수십만 명의 투자자가 그 가격을 기억.',
      items:['월봉 도지 종가','월봉 고거래량 사건봉 종가','월봉 대형 박스 상단·하단'],
      example:'삼성전자 월봉 도지 종가 ₩60,000 → 전 세계 투자자가 해당 가격을 기억 → 수개월 후 재방문 시 강한 반응'
    },
    {
      g:'A급', f:'주봉', c:'#c084fc',
      why:'주봉 하나는 5거래일(1주)의 합의. 기관·외국인·스윙트레이더가 주로 참고하는 단위.',
      items:['주봉 도지 종가','주봉 사건봉 종가','주봉 박스 상단·하단'],
      example:'AAPL 주봉 박스 상단 $185 → 3주 연속 저항 → 이 가격을 기억하는 참여자 많음'
    },
    {
      g:'B급', f:'일봉', c:'#60a5fa',
      why:'일봉 하나는 하루의 합의. 개인투자자 대부분이 보는 기본 단위. 자동 분석 기본값.',
      items:['일봉 도지 종가','일봉 사건봉 종가','일봉 박스 상단·하단'],
      example:'일봉 박스 하단 ₩75,000 → 수일 간 지지 역할 → 하지만 주봉·월봉에 밀릴 수 있음'
    },
    {
      g:'C급', f:'4H·1H', c:'#6b7280',
      why:'단기 참고용. 상위 프레임 기능선과 충돌 시 항상 상위가 우선. 단독으로 판단 금지.',
      items:['4시간봉 박스','1시간봉 도지','단기 사건봉'],
      example:'1시간봉 지지 ₩75,200이 일봉 저항 ₩75,000 근처라면 → 일봉(B급) 저항이 우선'
    }
  ];
  var strengths=['1순위: 거래량 — 클수록 강하다','2순위: 체류시간 — 오래 머문 구간일수록','3순위: 돌파 후 이동거리 — 이후 추세가 클수록','4순위: 반복 기능 — 반복 수행할수록','5순위: 프레임 — 월봉>주봉>일봉 우선'];
  var removals=['단순 스윙 저점/고점','거래량 없는 조정 저점·반등 고점','현재가와 가깝다는 이유만으로 선택','이동평균선·피보·라운드넘버만 근거','돌파 후 강한 이동 없었던 도지','최근이라는 이유만으로 선택한 저/고점'];
  var rules=['종가 기준이 아닌 장중 돌파로 판단하지 않는다.','도지 모양만 보고 매수/매도 결론 내리지 않는다.','박스와 추세를 구분하지 않고 분석하지 않는다.','사건봉 꼬리 끝만 보고 핵심 가격 정하지 않는다.','거래량 없는 돌파를 신뢰도 높게 평가하지 않는다.','기능선 사라졌는데 새 이유 붙여 보유하지 않는다.','갭 자체만 보고 의미 부여하지 않는다.','손절 기준 없이 가능성만 말하지 않는다.','현재가 가깝다는 이유로 지지/저항 선택하지 않는다.'];

  return '<div class="ct-pane" data-pane="theory" style="display:none">'

  // ── 차트술사 구조론 핵심 개념 ──
  +'<div style="padding:14px 16px;background:rgba(245,158,11,.08);border:1.5px solid #f59e0b;border-radius:12px;margin-bottom:14px">'
  +'<div style="font-size:14px;font-weight:900;color:#f59e0b;margin-bottom:4px">📖 차트술사 구조론</div>'
  +'<div style="font-size:12px;color:var(--mt)">차트는 시장 참여자들이 실제로 돈을 넣고 싸운 흔적을 기록한 역사책이다. 이 분석의 목적은 미래 가격을 맞히는 것이 아니라, 시장이 강하게 합의했던 가격을 찾고 지지·저항으로 작동할지 판정하는 것이다.</div>'
  +'</div>'
  +theoryCards.map(function(c){
    return '<div style="background:'+c.color+'0d;border:1px solid '+c.color+'33;border-radius:10px;padding:14px;margin-bottom:10px">'
    +'<div style="font-size:13px;font-weight:800;color:'+c.color+';margin-bottom:8px">'+c.title+'</div>'
    +'<div style="font-size:12px;color:var(--tx);line-height:1.8">'+c.body+'</div>'
    +'</div>';
  }).join('')

  +'<div class="ct-card"><div class="ct-card-title">📊 차트 분석 핵심 흐름</div>'
  +steps.map(function(s){ return '<div class="ct-step"><div class="ct-step-n">'+s.n+'</div><div class="ct-step-c"><div class="ct-step-t">'+s.t+'</div>'+s.d+'</div></div>'; }).join('')
  +'</div>'
  +'<div class="ct-card"><div class="ct-card-title">🕯 도지의 종류</div><div class="ct-card-body">'
  +'<div style="margin-bottom:10px"><strong style="color:var(--tx)">추세강화도지</strong><br>추세 중간 에너지 재충전. 상승추세강화도지 = 조정 시 지지후보. 하락추세강화도지 = 반등 시 저항후보.</div>'
  +'<div><strong style="color:var(--tx)">추세반전도지</strong><br>추세 전환 기준점. 재침범 시 새 추세 자체가 훼손 신호.</div>'
  +'</div></div>'
  +'<div class="ct-card">'
  +'<div class="ct-card-title">🏆 기능선 格 체계 — 어떤 봉에서 만들어졌는가</div>'
  +'<div style="font-size:12px;color:var(--mt);line-height:1.7;margin-bottom:10px">'
  +'같은 가격이라도 <b style="color:var(--tx)">어떤 프레임(봉 단위)에서 만들어진 지지·저항이냐</b>에 따라 힘이 다릅니다.<br>'
  +'더 큰 프레임 = 더 많은 사람이 더 오래 기억 = 더 강한 반응.'
  +'</div>'
  + grades.map(function(g){
    return '<div style="border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;margin-bottom:10px;background:rgba(255,255,255,.02)">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
    +'<div style="padding:3px 10px;border-radius:20px;background:'+g.c+'22;border:1px solid '+g.c+';font-weight:800;font-size:13px;color:'+g.c+'">'+g.g+'</div>'
    +'<div style="font-size:14px;font-weight:700;color:var(--tx)">'+g.f+'</div>'
    +'</div>'
    +'<div style="font-size:12px;color:var(--mt);margin-bottom:6px">'+g.why+'</div>'
    +'<div style="font-size:11px;color:#4b5563;margin-bottom:6px">해당되는 것: '
    +g.items.map(function(i){ return '<span style="background:var(--s1);border:1px solid var(--bd);border-radius:4px;padding:1px 6px;margin:0 2px">'+i+'</span>'; }).join('')
    +'</div>'
    +'<div style="font-size:11px;background:rgba(255,255,255,.03);border-left:2px solid '+g.c+';padding:6px 10px;border-radius:0 4px 4px 0;color:var(--mt)">'
    +'예) '+g.example+'</div>'
    +'</div>';
  }).join('')
  +'<div style="font-size:11px;color:#4b5563;padding:6px 0">⚡ 여러 급수가 같은 가격대에 겹칠수록 더 강한 기능선입니다. S급+A급 겹침 = 매우 강함.</div>'
  +'</div>'
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
