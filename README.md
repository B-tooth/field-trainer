# Species Flashcards v0.2

A private, free flashcard web app that uses PowerPoint slides as questions and PowerPoint title placeholders as answers.

## Run the app

1. Double-click `start-app.bat`.
2. Your browser opens at `http://localhost:8000`.
3. Choose **Fish Morphology**.
4. Identify the highlighted structure.
5. Select **Show answer**, then **Right** or **Wrong**.

Keyboard controls on a computer:

- `Space`: show the answer
- `Left arrow`: wrong
- `Right arrow`: right

Progress is saved in the browser on that device. Cards answered incorrectly receive a higher selection weight and therefore appear more frequently.

## Update the Fish Morphology deck

Each slide must use PowerPoint's built-in **title placeholder** for its answer. The title can be moved outside the visible slide area so it does not appear in the exported image.

1. Edit `decks\fish_morphology\Fish_morphology.pptx`.
2. Save and close PowerPoint.
3. Double-click `update-fish-deck.bat`.
4. Refresh the app in the browser.

The update tool:

- opens PowerPoint through Windows;
- exports every slide as a PNG;
- reads each slide's title placeholder;
- rebuilds `deck.json`;
- updates the main deck list.

Run `tools\setup-tools.bat` once if the tool reports that `python-pptx` is missing.

## Add another deck

1. Create a folder under `decks`, for example `decks\butterflies`.
2. Put exactly one `.pptx` file in it.
3. Give every slide a title placeholder containing the correct answer.
4. In the VS Code terminal, run:

```powershell
python tools\update_deck.py decks\butterflies --name "Butterflies"
```

The new deck will be added to the app automatically.

## Project layout

```text
species-flashcards/
├── app/
│   ├── index.html
│   ├── css/styles.css
│   ├── js/app.js
│   ├── manifest.webmanifest
│   └── service-worker.js
├── decks/
│   ├── index.json
│   └── fish_morphology/
│       ├── Fish_morphology.pptx
│       ├── deck.json
│       └── slide-1.png ...
├── tools/
│   ├── update_deck.py
│   ├── export_slides.ps1
│   └── setup-tools.bat
├── index.html
├── start-app.bat
└── update-fish-deck.bat
```

## Git workflow

After a successful change:

```powershell
git status
git add .
git commit -m "Describe the change"
```

Later, after connecting the repository to GitHub:

```powershell
git push
```

Do not commit temporary PowerPoint lock files beginning with `~$`; these are excluded by `.gitignore`.
