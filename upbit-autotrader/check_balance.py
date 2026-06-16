"""
잔고 및 현재 상태 확인용 스크립트
API 키 연결 테스트로도 사용
"""
import pyupbit
from config import ACCESS_KEY, SECRET_KEY, COIN

def check():
    print("Upbit 연결 확인 중...\n")

    # 현재가 조회 (API 키 없이도 가능)
    price = pyupbit.get_current_price(COIN)
    print(f"현재 {COIN} 가격: {price:,.0f}원")

    # API 키로 잔고 조회
    if ACCESS_KEY == "여기에_액세스키_입력":
        print("\nAPI 키가 설정되지 않았습니다.")
        print("config.py를 열어서 ACCESS_KEY와 SECRET_KEY를 입력해주세요.")
        return

    try:
        upbit = pyupbit.Upbit(ACCESS_KEY, SECRET_KEY)
        balances = upbit.get_balances()

        print("\n=== 현재 잔고 ===")
        for b in balances:
            if float(b['balance']) > 0:
                currency = b['currency']
                balance = float(b['balance'])
                if currency == "KRW":
                    print(f"KRW: {balance:,.0f}원")
                else:
                    avg_price = float(b.get('avg_buy_price', 0))
                    current = pyupbit.get_current_price(f"KRW-{currency}")
                    if current and avg_price > 0:
                        profit = (current - avg_price) / avg_price * 100
                        print(f"{currency}: {balance:.8f} | 매수평균가: {avg_price:,.0f}원 | 수익률: {profit:.2f}%")

        print("\nAPI 연결 성공!")

    except Exception as e:
        print(f"오류: {e}")
        print("API 키를 다시 확인해주세요.")

if __name__ == "__main__":
    check()
