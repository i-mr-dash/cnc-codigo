@echo off
REM Sobe o jogo em http://localhost:8124
cd /d "%~dp0"
echo Servindo "CNC Codigo" em http://localhost:8124 ...
start "" http://localhost:8124
python serve.py 8124
