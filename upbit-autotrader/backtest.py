# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import pyupbit
import pandas as pd

def get_data(ticker, days):
    """과거 일봉 데이터 + 지표 계산"""
    df = pyupbit.get_ohlcv(ticker, interval="day", count=days + 50)
    if df is None or len(df) < 30:
        return None

    df['ma5']  = df['close'].rolling(5).mean()
    df['ma10'] = df['close'].rolling(10).mean()
    df['ma20'] = df['close'].rolling(20).mean()

    # RSI 계산
    delta = df['close'].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, 1e-10)
    df['rsi'] = 100 - (100 / (1 + rs))

    # 거래량 이동평균 (거래량 필터용)
    df['vol_ma'] = df['volume'].rolling(5).mean()

    return df.iloc[-days - 1:].reset_index(drop=True)


def run_backtest(ticker, k, ma_col, rsi_max, use_vol_filter, days=365):
    """
    필터 조합 백테스트
    - ma_col: 'ma5' / 'ma10' / 'ma20' / None
    - rsi_max: RSI 상한선 (이 이상이면 진입 안 함)
    - use_vol_filter: 거래량이 5일 평균 이상일 때만 진입
    """
    df = get_data(ticker, days)
    if df is None:
        return None

    balance = 1_000_000
    win = lose = 0

    for i in range(1, len(df)):
        prev = df.iloc[i - 1]
        today = df.iloc[i]

        # MA 추세 필터: 오늘 시가가 MA 위에 있을 때만 매수
        if ma_col and pd.notna(today[ma_col]):
            if today['open'] <= today[ma_col]:
                continue

        # RSI 필터: 과매수 구간 제외
        if rsi_max and pd.notna(today['rsi']):
            if today['rsi'] >= rsi_max:
                continue

        # 거래량 필터: 평균 거래량 이상일 때만 진입
        if use_vol_filter and pd.notna(today['vol_ma']):
            if today['volume'] < today['vol_ma']:
                continue

        target = today['open'] + (prev['high'] - prev['low']) * k

        if today['high'] > target:
            profit_rate = (today['close'] - target) / target
            balance += balance * 0.3 * profit_rate
            if profit_rate > 0:
                win += 1
            else:
                lose += 1

    total = win + lose
    if total == 0:
        return None

    return {
        'win_rate': win / total * 100,
        'profit': (balance - 1_000_000) / 1_000_000 * 100,
        'trades': total,
        'win': win,
        'lose': lose,
    }


def grid_search(ticker="KRW-BTC", days=365, target_winrate=52.0):
    """52% 이상 승률을 내는 최적 파라미터 조합 탐색"""
    print(f"\n파라미터 최적화 중... (목표 승률: {target_winrate}%+)\n")

    k_list      = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    ma_list     = [None, 'ma5', 'ma10', 'ma20']
    rsi_list    = [None, 60, 65, 70, 75]
    vol_list    = [False, True]

    candidates = []

    for k in k_list:
        for ma in ma_list:
            for rsi in rsi_list:
                for vol in vol_list:
                    r = run_backtest(ticker, k, ma, rsi, vol, days)
                    if r is None:
                        continue
                    if r['win_rate'] >= target_winrate and r['trades'] >= 10:
                        r.update({'k': k, 'ma': ma or '없음', 'rsi': rsi or '없음', 'vol': vol})
                        candidates.append(r)

    if not candidates:
        print("목표 승률 달성 조합을 찾지 못했습니다. 기준을 낮춰 재탐색합니다.")
        return grid_search(ticker, days, target_winrate - 1.0)

    # 수익률 기준으로 정렬
    candidates.sort(key=lambda x: x['profit'], reverse=True)
    top = candidates[:5]

    print(f"{'순위':<4} {'K값':<6} {'MA필터':<8} {'RSI상한':<8} {'거래량필터':<10} {'승률':<8} {'수익률':<8} {'거래수'}")
    print("-" * 70)
    for idx, c in enumerate(top, 1):
        vol_str = "ON" if c['vol'] else "OFF"
        print(f"{idx:<4} {c['k']:<6} {str(c['ma']):<8} {str(c['rsi']):<8} {vol_str:<10} "
              f"{c['win_rate']:.1f}%{'':3} {c['profit']:+.1f}%{'':3} {c['trades']}회")

    best = top[0]
    print(f"\n{'='*50}")
    print(f"최적 설정 (수익률 최고)")
    print(f"  K값        : {best['k']}")
    print(f"  MA 필터    : {best['ma']}")
    print(f"  RSI 상한   : {best['rsi']}")
    print(f"  거래량 필터: {'ON' if best['vol'] else 'OFF'}")
    print(f"  승률       : {best['win_rate']:.1f}%")
    print(f"  수익률     : {best['profit']:+.1f}%")
    print(f"  거래 횟수  : {best['trades']}회")
    print(f"{'='*50}")

    return best


def show_detail(ticker="KRW-BTC", k=0.5, ma_col='ma10', rsi_max=70,
                use_vol_filter=False, days=365):
    """최적 설정으로 상세 결과 출력"""
    r = run_backtest(ticker, k, ma_col, rsi_max, use_vol_filter, days)
    if r is None:
        print("결과 없음")
        return

    ma_label = ma_col or '없음'
    rsi_label = str(rsi_max) if rsi_max else '없음'

    print(f"\n{'='*50}")
    print(f"상세 백테스트: {ticker}")
    print(f"K={k} | MA필터={ma_label} | RSI상한={rsi_label} | 거래량필터={'ON' if use_vol_filter else 'OFF'}")
    print(f"{'='*50}")
    print(f"최종 수익률  : {r['profit']:+.1f}%")
    print(f"승률         : {r['win_rate']:.1f}%  ({r['win']}승 {r['lose']}패)")
    print(f"총 거래 횟수 : {r['trades']}회")
    print(f"{'='*50}")


if __name__ == "__main__":
    TICKER = "KRW-BTC"
    DAYS   = 365

    # 1. 기존 전략 (필터 없음) 기준선
    print("[ 기존 전략 (필터 없음) ]")
    show_detail(TICKER, k=0.5, ma_col=None, rsi_max=None, use_vol_filter=False, days=DAYS)

    # 2. 파라미터 그리드 탐색 → 52%+ 조합 찾기
    best = grid_search(TICKER, days=DAYS, target_winrate=52.0)
