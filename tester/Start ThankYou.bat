@echo off
rem Starts ThankYou and opens it in the browser.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\tester\start.ps1"
if errorlevel 1 pause
