@echo off
cd /d "%~dp0"
python tools\update_deck.py decks\fish_morphology --name "Fish Morphology"
if errorlevel 1 (
  echo.
  echo Deck update failed. Read the error above.
) else (
  echo.
  echo Deck updated successfully. Refresh the app in your browser.
)
pause
