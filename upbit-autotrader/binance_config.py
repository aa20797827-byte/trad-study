# 바이낸스 API 키 설정
# Binance 웹사이트 → 프로필 → API Management에서 발급
API_KEY    = "여기에_API_KEY_입력"
API_SECRET = "여기에_API_SECRET_입력"

# 거래 설정
SYMBOL       = "BTCUSDT"   # 거래 페어 (BTC/USDT)
INVEST_RATE  = 0.3         # 보유 USDT의 30%만 투자
STOP_LOSS    = -0.05       # -5% 손절
K_VALUE      = 0.3         # 변동성 돌파 계수 (바이낸스 백테스트 최적값)

# 필터 설정 (바이낸스 백테스트 최적 조합 - 승률 57.7%, 수익률 +6.2%)
MA_PERIOD       = 20       # 이동평균 기간 (시가 > MA20 일 때만 매수)
RSI_MAX         = 75       # RSI 상한선 (75 이상이면 과매수로 진입 안 함)
USE_VOL_FILTER  = False    # 거래량 필터 (바이낸스는 OFF가 최적)

# 알림 설정 (선택사항)
TELEGRAM_TOKEN   = ""
TELEGRAM_CHAT_ID = ""
