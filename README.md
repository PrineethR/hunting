# Courtyard Scavenger Hunt (Static GitHub Pages)

A static HTML/CSS/JS camera scavenger hunt powered by Gemini Vision (`gemini-2.5-flash`), built for GitHub Pages (`https://prineethr.com/hunting/`).

## QR Code Link Format
Point your printed wedding QR code to:
```
https://prineethr.com/hunting/#k=YOUR_RESTRICTED_GEMINI_API_KEY
```
When a guest scans the QR code, `app.js` saves the `#k=...` key silently to their phone's `localStorage` and cleans the URL bar automatically. Make sure the API key in Google Cloud Console has **Website restrictions** set to `https://prineethr.com/*` and `https://prineethr.github.io/*`.

## Editing Clues
- Edit **`hunts/angana-courtyard.json`** to customize each stop's narrative, riddle, `actionPrompt`, `nudgeHint`, `propRevealNote`, and `verification` rules.
- Drop any visual-clue detail photos into **`clues/`** and reference them via `./clues/filename.jpg`.
