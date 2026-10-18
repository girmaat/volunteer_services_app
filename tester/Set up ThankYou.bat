@echo off
rem One-time setup (safe to run again).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\tester\setup.ps1"
if errorlevel 1 pause
