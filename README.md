# Angana Courtyard Scavenger Hunt

A narrative, camera-verified wedding scavenger hunt built with Next.js, TypeScript, and Gemini Vision (`gemini-2.5-flash`) for **Angana The Courtyard, Bangalore**.

Guests scan a QR code, follow 6–7 story clues one at a time, snap photos verified live by Gemini Vision, and the **first 5 finishers** atomically receive a numbered Winner Pass and Claim Code for physical goody bags.

---

## 1. Local Setup & Home Rehearsal Testing

1. **Install dependencies** (already installed if cloned locally):
   ```bash
   npm install
   ```
2. **Configure `.env.local`** (copy `.env.example` to `.env.local` if starting from a fresh clone):
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-2.5-flash
   SESSION_SECRET=any-long-random-hex-string
   ADMIN_PIN=2026
   DEFAULT_HUNT_ID=home-test
   ALLOW_HUNT_SWITCH=true
   ```
   > **Security note**: Never commit `.env.local` or share your `GEMINI_API_KEY` publicly. `.gitignore` excludes `.env*` automatically.
3. **Run the development server**:
   ```bash
   npm run dev
   ```
4. **Open in browser**:
   - **Guest Trail**: `http://localhost:3000` (defaults to **Home Rehearsal Trail**: Mirror, Mug/Cup, Houseplant, Book, Warm Light, Shoes/Keys).
   - **Host & Gift-Table Console**: `http://localhost:3000/admin` (PIN: `2026`).

### Testing on your Phone around the House
- Most mobile browsers require **HTTPS** for direct live-camera capture (`capture="environment"`), though `<input type="file">` still lets you pick/shoot photos over HTTP on Android and iOS Safari.
- For full HTTPS camera feel at home before deploying, run a quick HTTPS tunnel (e.g., `npx cloudflared tunnel --url http://localhost:3000`) or deploy directly to a preview URL on Vercel.

---

## 2. Customizing for Angana The Courtyard (Venue Visit)

1. Edit **`src/data/hunts/angana-courtyard.json`** to adjust your 7 story beats, riddles, hints, or `maxWinners` (defaults to `5`).
2. *(Optional accuracy boost)* During your walkthrough at Angana The Courtyard, take 1–2 photos of unique landmarks (e.g., the welcome arch or carved verandah pillar), save them in **`src/data/references/`** (`.jpg` under ~1200px), and list their filenames in `verification.referenceImages`:
   ```json
   "verification": {
     "targetDescription": "The carved teak pillar beside the main courtyard verandah.",
     "acceptNotes": "Any angle or evening light showing the carved timber column.",
     "referenceImages": ["angana-pillar.jpg"],
     "minConfidence": 0.65
   }
   ```
3. Before wedding day, switch `DEFAULT_HUNT_ID=angana-courtyard` and set `ALLOW_HUNT_SWITCH=false` so guests land straight on the wedding hunt without seeing the home test tab.

---

## 3. Deploying to Your Custom Domain (Vercel + GitHub)

GitHub Pages only hosts static HTML/JS and would expose your `GEMINI_API_KEY`. Deploy this GitHub repo (`PrineethR/hunting`) on **Vercel** (free Hobby tier) with your custom domain:

1. Import `PrineethR/hunting` in Vercel.
2. Add Environment Variables in Vercel Project Settings:
   - `GEMINI_API_KEY`
   - `SESSION_SECRET` (generate with `openssl rand -hex 32`)
   - `ADMIN_PIN` (change from `2026` to your own private PIN)
   - `DEFAULT_HUNT_ID=angana-courtyard`
   - `ALLOW_HUNT_SWITCH=false`
3. **Important for Production Winner Persistence**: Connect **Upstash Redis** (or Vercel KV) and add `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`). `src/lib/store.ts` automatically detects those env vars and runs an atomic Redis Lua script (`EVAL`) so two guests finishing at the exact same second can never both claim slot #5.
4. Point your custom domain DNS to Vercel, open `/admin`, and download the crisp print-ready SVG QR code for your courtyard tables and entrance easel.

---

## 4. Running Automated Tests

```bash
npm test
```
Tests cover HMAC token tamper resistance, clue-answer stripping, 20-way concurrent atomic First-5 winner locking, and a live Gemini Vision multimodal check (when `GEMINI_API_KEY` is present in `.env.local`).
