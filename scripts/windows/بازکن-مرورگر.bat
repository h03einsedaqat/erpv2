@echo off
chcp 65001 >nul
REM صبر مي‌كنيم سرور بالا بيايد، سپس مرورگر را باز مي‌كنيم
timeout /t 6 /nobreak >nul
start "" http://localhost:8080
exit /b
