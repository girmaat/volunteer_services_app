@echo off
rem Puts the test data back to its starting point.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\tester\reset.ps1"
if errorlevel 1 pause
