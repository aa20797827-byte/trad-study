@echo off
chcp 65001 > nul
echo 매일 오전 8시 자동 실행 예약 중...
echo (관리자 권한 필요)
echo.

set "SCRIPT_DIR=%~dp0"
set "MAIN_PY=%SCRIPT_DIR%main.py"

schtasks /create ^
  /tn "Instagram동기부여릴스" ^
  /tr "python \"%MAIN_PY%\"" ^
  /sc daily ^
  /st 08:00 ^
  /f

if %errorlevel%==0 (
    echo.
    echo ✅ 성공! 매일 오전 8:00에 자동 업로드됩니다.
    echo.
    echo 확인: 작업 스케줄러 ^> Instagram동기부여릴스
    echo 취소: schtasks /delete /tn "Instagram동기부여릴스" /f
) else (
    echo.
    echo ❌ 오류: 이 파일을 우클릭 → "관리자 권한으로 실행" 해주세요.
)

pause
