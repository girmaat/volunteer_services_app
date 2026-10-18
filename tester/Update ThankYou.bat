@echo off
rem Downloads the newest version and reloads the test data.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\tester\update.ps1"
if errorlevel 1 pause
