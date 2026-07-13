@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000
  py -m http.server 8000
) else (
  echo Python is not installed. Use Visual Studio Code with the Live Server extension,
  echo or follow the GitHub Pages instructions in README.md.
  pause
)
