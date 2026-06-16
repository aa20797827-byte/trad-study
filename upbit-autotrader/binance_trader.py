# -*- coding: utf-8 -*-
"""
바이낸스 자동매매 (현물 스팟)
- 변동성 돌파 + MA20 + 거래량 필터
- BTCUSDT 기준
"""
import time
import datetime
import requests
from binance.client import Client
from binance.exceptions import BinanceAPIException
import pandas as pd
from binance_config import (
    API_KEY, API_SECRET, SYMBOL,
    INVEST_RATE, STOP_LOSS, K_VALUE,
    MA_PERIOD, RSI_MAX, USE_VOL_FILTER,
    TELEGRAM_TOKEN, TELEGRAM_CHAT_ID
)

BASE_ASSET  = SYMBOL.replace("USDT", "")   # 예: "BTC"
QUOTE_ASSET = "USDT"


def send_telegram(msg):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        requests.post(url, data={"chat_id": TELEGRAM_CHAT_ID, "text": msg}, timeout=5)
    except Exception:
        pass


def log(msg):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    full_msg = f"[{now}] {msg}"
    print(full_msg)
    send_telegram(full_msg)


def get_daily_data(client, symbol, limit=30):
    """일봉 데이터 + 지표 계산"""
    raw = client.get_klines(symbol=symbol, interval=Client.KLINE_INTERVAL_1DAY, limit=limit)
    df = pd.DataFrame(raw, columns=[
        'open_time','open','high','low','close','volume',
        'close_time','qav','trades','tbbav','tbqav','ignore'
    ])
    df[['open','high','low','close','volume']] = \
        df[['open','high','low','close','volume']].astype(float)

    df['ma'] = df['close'].rolling(MA_PERIOD).mean()
    df['vol_ma'] = df['volume'].rolling(5).mean()

    delta = df['close'].diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    df['rsi'] = 100 - (100 / (1 + gain / loss.replace(0, 1e-10)))

    return df


def get_indicators(client, symbol):
    """목표가 + 모든 필터 값 계산"""
    df = get_daily_data(client, symbol, limit=MA_PERIOD + 20)
    if len(df) < MA_PERIOD + 1:
        return None, None, None, None, None

    prev  = df.iloc[-2]
    today = df.iloc[-1]

    target    = today['open'] + (prev['high'] - prev['low']) * K_VALUE
    ma_val    = today['ma']
    rsi_val   = today['rsi']
    vol_today = prev['volume']
    vol_ma    = prev['vol_ma']

    return target, ma_val, rsi_val, vol_today, vol_ma


def is_entry_allowed(client, symbol):
    target, ma_val, rsi_val, vol_today, vol_ma = get_indicators(client, symbol)
    if target is None:
        return False, None

    df = get_daily_data(client, symbol, limit=2)
    today_open = df.iloc[-1]['open']

    # MA 필터
    if today_open <= ma_val:
        log(f"MA{MA_PERIOD} 필터: 시가({today_open:.2f}) <= MA({ma_val:.2f}) → 진입 차단")
        return False, target

    # RSI 필터
    if RSI_MAX and pd.notna(rsi_val) and rsi_val >= RSI_MAX:
        log(f"RSI 필터: RSI({rsi_val:.1f}) >= {RSI_MAX} → 과매수 진입 차단")
        return False, target

    # 거래량 필터
    if USE_VOL_FILTER and vol_ma and vol_today < vol_ma:
        log(f"거래량 필터: 전일 거래량 < 5일 평균 → 진입 차단")
        return False, target

    return True, target


def get_usdt_balance(client):
    bal = client.get_asset_balance(asset=QUOTE_ASSET)
    return float(bal['free']) if bal else 0.0


def get_coin_balance(client):
    bal = client.get_asset_balance(asset=BASE_ASSET)
    return float(bal['free']) if bal else 0.0


def is_holding(client):
    return get_coin_balance(client) > 0.0001


def buy_market(client, symbol, usdt_amount):
    """시장가 매수 (USDT 금액 기준)"""
    if usdt_amount < 10:
        log("최소 주문 금액($10) 미만입니다.")
        return None
    try:
        order = client.order_market_buy(symbol=symbol, quoteOrderQty=round(usdt_amount, 2))
        return order
    except BinanceAPIException as e:
        log(f"매수 오류: {e}")
        return None


def sell_market(client, symbol):
    """전량 시장가 매도"""
    qty = get_coin_balance(client)
    if qty <= 0.0001:
        return None
    # 수량 소수점 5자리로 자르기 (BTC 기준 최소 단위)
    qty = float(f"{qty:.5f}")
    try:
        order = client.order_market_sell(symbol=symbol, quantity=qty)
        return order
    except BinanceAPIException as e:
        log(f"매도 오류: {e}")
        return None


def run():
    log("=== 바이낸스 자동매매 시작 ===")

    if API_KEY == "여기에_API_KEY_입력":
        log("binance_config.py에서 API 키를 입력해주세요.")
        return

    client = Client(API_KEY, API_SECRET)

    try:
        usdt = get_usdt_balance(client)
        price = float(client.get_symbol_ticker(symbol=SYMBOL)['price'])
        log(f"연결 성공 | USDT 잔고: ${usdt:,.2f} | BTC 현재가: ${price:,.2f}")
    except BinanceAPIException as e:
        log(f"API 연결 실패: {e}")
        return

    bought_price = None
    entry_checked_today = False
    entry_allowed = False
    target_price  = None

    while True:
        try:
            now = datetime.datetime.now(datetime.timezone.utc)  # 바이낸스는 UTC 기준

            # 매일 UTC 00:01 에 필터 조건 재계산
            if now.hour == 0 and now.minute >= 1 and not entry_checked_today:
                entry_allowed, target_price = is_entry_allowed(client, SYMBOL)
                entry_checked_today = True
                status = "진입 허용" if entry_allowed else "진입 차단"
                log(f"오늘 필터: {status} | 목표가: ${target_price:.2f}" if target_price else f"오늘 필터: {status}")

            if now.hour == 0 and now.minute == 0:
                entry_checked_today = False

            current_price = float(client.get_symbol_ticker(symbol=SYMBOL)['price'])

            # 보유 중 → 손절 체크
            if is_holding(client) and bought_price:
                loss_rate = (current_price - bought_price) / bought_price
                if loss_rate <= STOP_LOSS:
                    log(f"손절 발동! 수익률: {loss_rate*100:.1f}% → 전량 매도")
                    sell_market(client, SYMBOL)
                    bought_price = None

            # 미보유 + 필터 통과 + 목표가 돌파 → 매수
            elif not is_holding(client) and entry_allowed and target_price:
                if current_price >= target_price:
                    usdt = get_usdt_balance(client)
                    invest = usdt * INVEST_RATE
                    log(f"매수 신호! ${current_price:,.2f} >= 목표가 ${target_price:.2f} | 투자금: ${invest:.2f}")
                    result = buy_market(client, SYMBOL, invest)
                    if result:
                        bought_price = current_price
                        log("매수 완료!")

            # UTC 23:50 → 당일 포지션 청산
            if now.hour == 23 and now.minute >= 50 and is_holding(client):
                if bought_price:
                    profit = (current_price - bought_price) / bought_price * 100
                    log(f"일일 청산 | 수익률: {profit:.2f}%")
                sell_market(client, SYMBOL)
                bought_price = None
                log("전량 매도 완료")

            time.sleep(10)

        except Exception as e:
            log(f"오류: {e}")
            time.sleep(30)


if __name__ == "__main__":
    run()
