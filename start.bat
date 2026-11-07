@echo off
cd /d "%~dp0app"
if not exist node_modules call npm install
npm run dev
