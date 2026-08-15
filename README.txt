Field Trainer v0.6.2 — Quality of Life

NEW FEATURES
- Search by species name in Read mode
- Hide/show the answer while browsing
- Smooth card transitions
- A more informative deck library with accuracy bars
- Continue buttons for the most recently used deck
- Version number displayed in the app
- Automatic backup and idempotent CSS installation

INSTALL
1. Stop the local server with Ctrl+C.
2. Extract this ZIP directly into the project root:
   Z:\OneDrive\Documents\Flash_cards\species-flashcards_v0.3
3. From that folder, run:
   powershell -ExecutionPolicy Bypass -File .\install-v0.6.2.ps1
4. Start the server:
   python -m http.server 8000
5. Open:
   http://localhost:8000/app/
6. Hard refresh with Ctrl+Shift+R.

TEST CHECKLIST
- Open a deck in Read mode and search for part of a species name.
- Clear the search and move between cards.
- Hide and show the answer.
- Return to Decks and confirm the Continue panel appears.
- Confirm the last-used deck has a badge and accuracy bar.
- Run a short test and make sure zoom and mistake review still work.
