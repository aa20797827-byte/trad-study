@echo off
chcp 65001 > nul
echo =============================================
echo   Instagram 릴스 자동화 — 패키지 설치
echo =============================================
echo.

python -m pip install -r requirements.txt

echo.
echo =============================================
echo   설치 완료! 다음 단계:
echo   1. config.json 열어서 API 키 3개 입력
echo   2. python test_setup.py  (설정 확인)
echo   3. python main.py         (첫 실행 테스트)
echo   4. schedule_daily.bat     (매일 자동화)
echo =============================================
pause
