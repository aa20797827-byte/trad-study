# -*- coding: utf-8 -*-
"""
실제 자동매매 실행 파일
- 변동성 돌파 전략 + MA20 필터 + 거래량 필터
- 백테스트 최적 설정: 승률 70.4%, 수익률 +4.8%
"""
import pyupbit
import time
import datetime
import requests
from config import (
    ACCESS_KEY, SECRET_KEY, COIN,
    INVEST_RATE, STOP_LOSS, K_VALUE,
    MA_PERIOD, USE_VOL_FILTER,
    TELEGRAM_TOKEN, TELEGRAM_CHAT_ID
)


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


def get_indicators(ticker):
    """
    목표가, MA20, 거래량 필터 값 한 번에 계산
    - count=30: MA20 계산에 충분한 데이터
    """
    df = pyupbit.get_ohlcv(ticker, interval="day", count=30)
    if df is None or len(df) < MA_PERIOD + 1:
        return None, None, None, None

    yesterday = df.iloc[-2]
    today = df.iloc[-1]

    target_price = today['open'] + (yesterday['high'] - yesterday['low']) * K_VALUE
    ma = df['close'].rolling(MA_PERIOD).mean().iloc[-1]
    vol_ma = df['volume'].rolling(5).mean().iloc[-2]  # 전일 5일 평균 거래량
    today_vol = yesterday['volume']                   # 전일 거래량 (오늘 장중 비교용)

    return target_price, ma, today_vol, vol_ma


def is_entry_allowed(ticker):
    """
    MA20 + 거래량 필터 통과 여부 확인
    - 오늘 시가 > MA20: 상승 추세
    - 전일 거래량 > 5일 평균: 거래 활성
    """
    target_price, ma, today_vol, vol_ma = get_indicators(ticker)
    if target_price is None:
        return False, None

    df = pyupbit.get_ohlcv(ticker, interval="day", count=2)
    today_open = df.iloc[-1]['open'] if df is not None else None

    if today_open is None or ma is None:
        return False, target_price

    # MA20 필터
    if today_open <= ma:
        log(f"MA20 필터: 시가({today_open:,.0f}) <= MA20({ma:,.0f}) → 진입 안 함")
        return False, target_price

    # 거래량 필터
    if USE_VOL_FILTER and vol_ma and today_vol < vol_ma:
        log(f"거래량 필터: 전일 거래량({today_vol:.0f}) < 5일 평균({vol_ma:.0f}) → 진입 안 함")
        return False, target_price

    return True, target_price


def get_current_price(ticker):
    return pyupbit.get_current_price(ticker)


def get_balance(upbit, currency="KRW"):
    balances = upbit.get_balances()
    for b in balances:
        if b['currency'] == currency:
            return float(b['balance'])
    return 0


def get_coin_balance(upbit, ticker):
    currency = ticker.split("-")[1]
    balances = upbit.get_balances()
    for b in balances:
        if b['currency'] == currency:
            return float(b['balance'])
    return 0


def is_holding(upbit, ticker):
    return get_coin_balance(upbit, ticker) > 0


def buy(upbit, ticker, krw_amount):
    if krw_amount < 5000:
        log("매수 금액이 최소 주문금액(5,000원) 미만입니다.")
        return None
    return upbit.buy_market_order(ticker, krw_amount)


def sell_all(upbit, ticker):
    coin_balance = get_coin_balance(upbit, ticker)
    if coin_balance <= 0:
        return None
    return upbit.sell_market_order(ticker, coin_balance)


def run():
    log("=== 자동매매 시작 ===")
    log(f"코인: {COIN} | K값: {K_VALUE} | MA{MA_PERIOD} + 거래량필터{'ON' if USE_VOL_FILTER else 'OFF'}")

    upbit = pyupbit.Upbit(ACCESS_KEY, SECRET_KEY)

    try:
        krw = get_balance(upbit, "KRW")
        log(f"API 연결 성공 | KRW 잔고: {krw:,.0f}원")
    except Exception as e:
        log(f"API 연결 실패: {e} → config.py의 키를 확인해주세요.")
        return

    bought_price = None
    entry_checked_today = False
    entry_allowed = False
    target_price = None

    while True:
        try:
            now = datetime.datetime.now()

            # 매일 오전 9시에 필터 조건 재계산 (하루 1회)
            if now.time() >= datetime.time(9, 1) and not entry_checked_today:
                entry_allowed, target_price = is_entry_allowed(COIN)
                entry_checked_today = True
                status = "진입 허용" if entry_allowed else "진입 차단"
                log(f"오늘 필터 결과: {status} | 목표가: {target_price:,.0f}원" if target_price else f"오늘 필터 결과: {status}")

            # 자정 지나면 플래그 초기화
            if now.time() < datetime.time(0, 5):
                entry_checked_today = False

            # 매매 활성 시간: 오전 9시 ~ 오후 8시 50분
            if datetime.time(9, 0) <= now.time() <= datetime.time(20, 50):
                current_price = get_current_price(COIN)
                if current_price is None:
                    time.sleep(10)
                    continue

                # 보유 중 → 손절 체크
                if is_holding(upbit, COIN) and bought_price:
                    loss_rate = (current_price - bought_price) / bought_price
                    if loss_rate <= STOP_LOSS:
                        log(f"손절 발동! 수익률: {loss_rate*100:.1f}% → 전량 매도")
                        sell_all(upbit, COIN)
                        bought_price = None

                # 미보유 + 필터 통과 + 목표가 돌파 → 매수
                elif not is_holding(upbit, COIN) and entry_allowed and target_price:
                    if current_price >= target_price:
                        krw = get_balance(upbit, "KRW")
                        invest_amount = krw * INVEST_RATE
                        log(f"매수 신호! 현재가: {current_price:,.0f} | 목표가: {target_price:,.0f} | 투자금: {invest_amount:,.0f}원")
                        result = buy(upbit, COIN, invest_amount)
                        if result:
                            bought_price = current_price
                            log("매수 완료!")
                        else:
                            log("매수 실패")

            # 오후 8시 50분: 당일 포지션 청산
            elif now.time() >= datetime.time(20, 50) and is_holding(upbit, COIN):
                current_price = get_current_price(COIN)
                if bought_price and current_price:
                    profit = (current_price - bought_price) / bought_price * 100
                    log(f"장 마감 매도 | 수익률: {profit:.2f}%")
                sell_all(upbit, COIN)
                bought_price = None
                log("전량 매도 완료")

            time.sleep(10)

        except Exception as e:
            log(f"오류: {e}")
            time.sleep(30)


if __name__ == "__main__":
    run()
