# Species Flashcards

A small personal flashcard app built from PowerPoint decks. The first included deck is **Fish Morphology**, containing eight cards.

## What the app does

1. Shows one of your exported PowerPoint slides as the question.
2. Reveals the slide title when you select **Show answer**.
3. Lets you mark your answer **Right** or **Wrong**.
4. Saves results on that device.
5. Gives cards with more wrong answers a higher chance of returning.

Progress is stored in the browser, not in the PowerPoint or Git repository.

## Folder structure

```text
species-flashcards/
├── index.html
├── app.js
├── styles.css
├── decks/
│   ├── index.json
│   └── fish_morphology/
│       ├── Fish_morphology.pptx
│       ├── deck.json
│       ├── slide-1.png
│       └── ...
└── scripts/
    └── export-deck.ps1
```

Each deck has its own folder. Keep its PowerPoint, PNG images and `deck.json` together.

## Try the app on Windows

The app must be opened through a small web server. Double-clicking `index.html` directly will not work reliably.

### Easiest local method

1. Extract the downloaded ZIP.
2. Open the `species-flashcards` folder.
3. Double-click `start-app.bat`.
4. Your browser should open at `http://localhost:8000`.
5. Choose **Fish Morphology**.
6. Study the red-highlighted feature.
7. Select **Show answer**.
8. Select **Right** or **Wrong**.

The command window must remain open while using the local app. Close it when finished.

`start-app.bat` requires Python. Git for Windows does not always include Python. When Python is unavailable, use GitHub Pages as described below, or install the free Visual Studio Code **Live Server** extension.

## Set up Git

Install **Git for Windows**, then open the project folder, right-click inside it and choose **Open Git Bash here**. Run:

```bash
git init
git add .
git commit -m "Create first species flashcard app"
```

Create an empty repository on GitHub called `species-flashcards`. GitHub will show the commands needed to connect it. They normally resemble:

```bash
git branch -M main
git remote add origin YOUR_REPOSITORY_ADDRESS
git push -u origin main
```

Do not add a README or licence when creating the GitHub repository because this project already contains a README.

## Publish free with GitHub Pages

After pushing the project to GitHub:

1. Open the repository on GitHub.
2. Open **Settings**.
3. Open **Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose branch **main** and folder **/(root)**.
6. Save.
7. GitHub will provide the app address after deployment finishes.

On Android, open that address in Chrome. Use Chrome's menu and choose **Add to Home screen** or **Install app** when offered.

## Update the Fish Morphology deck

The included PowerShell script uses the desktop version of Microsoft PowerPoint to export the slides and read their title placeholders.

1. Edit `decks/fish_morphology/Fish_morphology.pptx`.
2. Make sure every slide has its answer in the built-in PowerPoint **Title** placeholder.
3. Save and close the presentation.
4. In the project folder, right-click and choose **Open in Terminal**.
5. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-deck.ps1 -PowerPointFile .\decks\fish_morphology\Fish_morphology.pptx
```

The script will:

- read each slide title;
- export each slide as `slide-1.png`, `slide-2.png`, etc.;
- rebuild `deck.json`;
- update `decks/index.json`.

Then record and upload the change:

```bash
git add .
git commit -m "Update fish morphology deck"
git push
```

GitHub Pages will update automatically after the push. You may need to refresh the installed app after deployment.

## Add another deck

For a new Plants deck:

1. Create `decks/plants/`.
2. Save the PowerPoint as `decks/plants/Plants.pptx`.
3. Put each answer in its slide's built-in Title placeholder.
4. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-deck.ps1 -PowerPointFile .\decks\plants\Plants.pptx
```

The script creates the images and manifests. Commit and push the result with Git.

## Important limitations of this first version

- The app does not open PowerPoint files itself. PowerPoint and the provided script produce the PNG images and answer list before publishing.
- Progress is stored separately on each browser/device. Clearing browser data resets it.
- The selection system is deliberately simple: wrong answers increase a card's weighting; correct answers gradually reduce it.
- The app avoids showing the same card twice consecutively when the deck contains more than one card.

## Resetting progress

Open a deck and select **Reset deck progress**. This only resets the selected deck on the current device.
