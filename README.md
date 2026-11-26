# Angana Courtyard Scavenger Hunt (Static GitHub Pages)

A 100% static HTML/CSS/JS camera scavenger hunt powered by Gemini Vision (`gemini-2.5-flash`) for **Angana The Courtyard, Bangalore**—designed to host directly on **GitHub Pages** (`https://prineethr.com/hunting/`).

---

## 1. Enable GitHub Pages (1 Minute)

1. Open `https://github.com/PrineethR/hunting` → **Settings → Pages**.
2. Set **Source** to **Deploy from a branch** → **`main`** → **`/ (root)`** → **Save**.
3. Your site will be live at **`https://prineethr.com/hunting/`** (or `https://prineethr.github.io/hunting/`).

---

## 2. Generate Your Wedding QR Code (Without Exposing Your Key on GitHub)

1. Make sure your **Generative Language API Key** in Google Cloud Console has **Website restrictions** set to:
   - `https://prineethr.com/*`
   - `https://prineethr.com/hunting`
   - `https://prineethr.github.io/*`
2. Open **`https://prineethr.com/hunting/qr.html`**.
3. Select **Courtyard Trails at Angana**, paste your restricted API key, and download the print-ready **SVG QR code**.
4. When guests scan the QR code, the `#k=...` fragment saves the key locally in their browser and immediately cleans the URL bar.

---

## 3. Customizing Clues After Your Venue Visit

- Edit **`hunts/angana-courtyard.json`** to tweak story text, riddles, `actionPrompt` twists, or `propRevealNote` clues.
- Replace or add visual close-up clue images in **`clues/`** and point any stop's `clueImage` to `./clues/your-image.jpg`.
- The first 5 guests or pairs who walk up to your gift table showing their stamped **Finisher Pass** (plus their downloadable **Keepsake Photo Strip**) claim the 5 physical goody bags.
