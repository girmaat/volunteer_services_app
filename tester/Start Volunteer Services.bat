@echo off
rem Starts Volunteer Services and opens it in the browser.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\tester\start.ps1"
if errorlevel 1 pause
