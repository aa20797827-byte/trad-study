# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from binance.client import Client
import pandas as pd

def get_data(symbol, days):
    """바이낸스 일봉 데이터 + 지표 계산"""
    client = Client()  # 공개 데이터는 API 키 없이 조회 가능
    limit = days + 50

    raw = client.get_klines(
        symbol=symbol,
        interval=Client.KLINE_INTERVAL_1DAY,
        limit=limit
    )

    df = pd.DataFrame(raw, columns=[
        'open_time','open','high','low','close','volume',
        'close_time','qav','trades','tbbav','tbqav','ignore'
    ])
    df[['open','high','low','close','volume']] = \
        df[['open','high','low','close','volume']].astype(float)

    df['ma5']    = df['close'].rolling(5).mean()
    df['ma10']   = df['close'].rolling(10).mean()
    df['ma20']   = df['close'].rolling(20).mean()
    df['vol_ma'] = df['volume'].rolling(5).mean()

    delta = df['close'].diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    df['rsi'] = 100 - (100 / (1 + gain / loss.replace(0, 1e-10)))

    return df.iloc[-(days + 1):].reset_index(drop=True)


def run_backtest(symbol, k, ma_col, rsi_max, use_vol, days=365):
    df = get_data(symbol, days)
    if df is None or len(df) < 2:
        return None

    balance = 10_000.0  # 초기 자금 $10,000 USDT
    win = lose = 0

    for i in range(1, len(df)):
        prev  = df.iloc[i - 1]
        today = df.iloc[i]

        if ma_col and pd.notna(today[ma_col]):
            if today['open'] <= today[ma_col]:
                continue

        if rsi_max and pd.notna(today['rsi']):
            if today['rsi'] >= rsi_max:
                continue

        if use_vol and pd.notna(prev['vol_ma']):
            if prev['volume'] < prev['vol_ma']:
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
        'profit':   (balance - 10_000) / 10_000 * 100,
        'trades':   total,
        'win': win, 'lose': lose,
        'final': balance,
    }


def grid_search(symbol="BTCUSDT", days=365, target_wr=52.0):
    print(f"\n파라미터 최적화 중... (목표 승률: {target_wr}%+)\n")

    candidates = []
    for k in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
        for ma in [None, 'ma5', 'ma10', 'ma20']:
            for rsi in [None, 60, 65, 70, 75]:
                for vol in [False, True]:
                    r = run_backtest(symbol, k, ma, rsi, vol, days)
                    if r and r['win_rate'] >= target_wr and r['trades'] >= 10:
                        r.update({'k': k, 'ma': ma or '없음', 'rsi': rsi or '없음', 'vol': vol})
                        candidates.append(r)

    if not candidates:
        return grid_search(symbol, days, target_wr - 1.0)

    candidates.sort(key=lambda x: x['profit'], reverse=True)
    top = candidates[:5]

    print(f"{'순위':<4} {'K값':<6} {'MA필터':<8} {'RSI상한':<8} {'거래량':<8} {'승률':<8} {'수익률':<8} {'거래수'}")
    print("-" * 65)
    for idx, c in enumerate(top, 1):
        print(f"{idx:<4} {c['k']:<6} {str(c['ma']):<8} {str(c['rsi']):<8} "
              f"{'ON' if c['vol'] else 'OFF':<8} {c['win_rate']:.1f}%{'':3} "
              f"{c['profit']:+.1f}%{'':3} {c['trades']}회")

    best = top[0]
    print(f"\n{'='*55}")
    print(f"최적 설정")
    print(f"  K값        : {best['k']}")
    print(f"  MA 필터    : {best['ma']}")
    print(f"  RSI 상한   : {best['rsi']}")
    print(f"  거래량 필터: {'ON' if best['vol'] else 'OFF'}")
    print(f"  승률       : {best['win_rate']:.1f}%")
    print(f"  수익률     : {best['profit']:+.1f}%")
    print(f"  거래 횟수  : {best['trades']}회")
    print(f"  최종 잔고  : ${best['final']:,.2f} (초기 $10,000)")
    print(f"{'='*55}")
    return best


def show_detail(symbol, k, ma_col, rsi_max, use_vol, days=365):
    r = run_backtest(symbol, k, ma_col, rsi_max, use_vol, days)
    if not r:
        print("결과 없음")
        return
    print(f"\n{'='*55}")
    print(f"상세 백테스트: {symbol} | K={k} | MA={ma_col or '없음'} | RSI={rsi_max or '없음'} | 거래량={'ON' if use_vol else 'OFF'}")
    print(f"{'='*55}")
    print(f"수익률     : {r['profit']:+.1f}%")
    print(f"승률       : {r['win_rate']:.1f}%  ({r['win']}승 {r['lose']}패)")
    print(f"거래 횟수  : {r['trades']}회")
    print(f"최종 잔고  : ${r['final']:,.2f} (초기 $10,000)")
    print(f"{'='*55}")


if __name__ == "__main__":
    SYMBOL = "BTCUSDT"
    DAYS   = 365

    print("[ 기존 전략 (필터 없음) ]")
    show_detail(SYMBOL, k=0.5, ma_col=None, rsi_max=None, use_vol=False, days=DAYS)

    print("\n[ Upbit 최적 설정 그대로 적용 ]")
    show_detail(SYMBOL, k=0.7, ma_col='ma20', rsi_max=None, use_vol=True, days=DAYS)

    best = grid_search(SYMBOL, days=DAYS, target_wr=52.0)
