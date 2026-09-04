@echo off
chcp 65001 >nul
title راهکار - سامانه جامع سازمانی و مالی
cd /d "%~dp0"

echo.
echo  ============================================
echo    راهکار - سامانه جامع سازماني و مالي
echo  ============================================
echo.

REM بررسي وجود Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js روي اين رايانه نصب نيست.
  echo  لطفا Node.js نسخه 20 يا بالاتر را نصب كنيد:
  echo  https://nodejs.org
  echo.
  pause
  exit /b 1
)

REM نمايش نسخه Node
for /f "tokens=*" %%v in ('node -v') do set NODEV=%%v
echo  نسخه Node.js شما: %NODEV%

REM نصب وابستگي‌ها در نخستين اجرا
if not exist "node_modules" (
  echo.
  echo  در حال نصب وابستگي‌ها ... يك بار انجام مي‌شود و نياز به اينترنت دارد.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo  نصب ناموفق بود. از اتصال اينترنت مطمئن شويد و دوباره اجرا كنيد.
    pause
    exit /b 1
  )
)

REM توليد كليد امن در صورت نبود
if "%JWT_SECRET%"=="" set JWT_SECRET=windows-local-%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%

echo.
echo  برنامه روي آدرس زير باز مي‌شود:
echo  http://localhost:8080
echo.
echo  براي توقف، همين پنجره را ببنديد ^(يا Ctrl+C^).
echo.

REM باز كردن مرورگر پس از آماده شدن سرور
if exist "%~dp0بازکن-مرورگر.bat" start "" /B "%~dp0بازکن-مرورگر.bat"

set PORT=8080
set NODE_ENV=production
call npx tsx server/index.ts

echo.
echo  سرور متوقف شد.
pause
