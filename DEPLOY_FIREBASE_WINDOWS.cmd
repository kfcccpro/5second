@echo off
setlocal
cd /d "%~dp0"

echo JK English safe deploy
echo This entry point now runs the same build + QA + Hosting pipeline as DEPLOY_WINDOWS.cmd.
echo.
call "%~dp0DEPLOY_WINDOWS.cmd"
exit /b %errorlevel%
