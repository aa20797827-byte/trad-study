@echo off
chcp 65001 > nul
echo.
echo  ===========================================
echo   국장 데이트레이딩 매매일지 서버 시작
echo  ===========================================
echo.

if not exist ".env" (
  echo [오류] .env 파일이 없습니다.
  echo .env.example 파일을 복사해서 .env로 저장 후 내용을 채워주세요.
  pause
  exit /b 1
)

if not exist "venv\Scripts\activate.bat" (
  echo [설치] 가상환경 생성 중...
  python -m venv venv
  echo [설치] 패키지 설치 중...
  venv\Scripts\pip install -r requirements.txt
)

echo [시작] http://localhost:5000 에서 실행 중...
echo        브라우저에서 위 주소로 접속하세요.
echo        종료하려면 Ctrl+C 를 누르세요.
echo.
venv\Scripts\python app.py
pause
