# Upbit API 키 설정
# Upbit 웹사이트 → 마이페이지 → Open API 관리에서 발급
ACCESS_KEY = "여기에_액세스키_입력"
SECRET_KEY = "여기에_시크릿키_입력"

# 거래 설정
COIN = "KRW-BTC"          # 거래할 코인 (비트코인)
INVEST_RATE = 0.3          # 보유 현금의 30%만 투자
STOP_LOSS = -0.05          # -5% 손절
K_VALUE = 0.7              # 변동성 돌파 계수 (백테스트 최적값)

# 필터 설정 (백테스트로 찾은 최적 조합 - 승률 70.4%)
MA_PERIOD = 20             # 이동평균 기간 (시가가 MA20 위일 때만 매수)
USE_VOL_FILTER = True      # 거래량 필터 (5일 평균 거래량 이상일 때만 매수)

# 알림 설정 (선택사항 - 텔레그램)
TELEGRAM_TOKEN = ""        # 텔레그램 봇 토큰 (비워두면 알림 없음)
TELEGRAM_CHAT_ID = ""      # 텔레그램 채팅 ID
