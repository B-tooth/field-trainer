Field Trainer v0.6.1 — Complete Image Zoom

This update adds:
- Pinch-to-zoom on phones and tablets
- One-finger panning while zoomed
- Double-tap/double-click zoom toggle
- Cursor-centred mouse-wheel zoom
- 100%–500% zoom indicator
- Automatic limits so the image cannot be dragged completely off-screen
- Cleaner mobile controls
- Automatic backup during installation

INSTALLATION

1. Extract the ZIP directly into the ROOT of your project:
   Z:\OneDrive\Documents\Flash_cards\species-flashcards_v0.3

2. In PowerShell, from the project root, run:

   powershell -ExecutionPolicy Bypass -File .\install-v0.6.1.ps1

3. Start the app:

   python -m http.server 8000

4. Open:

   http://localhost:8000/app/

5. Hard refresh with Ctrl+Shift+R.

TEST

Desktop:
- Click an image.
- Scroll to zoom around the pointer.
- Drag to pan.
- Double-click to switch between fitted and 200%.
- Press Esc to close.

Phone/tablet:
- Tap an image.
- Pinch with two fingers.
- Drag with one finger while zoomed.
- Double-tap to switch between fitted and 200%.
