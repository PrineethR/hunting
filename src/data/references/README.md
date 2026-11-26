# Venue Reference Images

Drop 1–2 real photos per unique courtyard stop here during your visit to **Angana The Courtyard**, then add their filenames to `verification.referenceImages` inside `src/data/hunts/angana-courtyard.json`.

For example:

```json
"verification": {
  "targetDescription": "The carved wooden pillar with red-oxide base near the main courtyard verandah.",
  "acceptNotes": "Any angle or evening lighting showing this pillar or architectural verandah corner.",
  "referenceImages": ["angana-pillar.jpg"],
  "minConfidence": 0.65
}
```

### Tips for great venue reference shots
- Shoot from the eye-level angle guests will naturally stand at.
- Resize large 12MP phone photos down to ~1200px wide (`.jpg` or `.png`) so serverless deployments stay lean and verification stays under ~1.5 seconds.
- Generic stops (like a mirror, brass lamp, or frangipani canopy) don't strictly need reference photos, though adding one makes unique venue landmarks nearly 100% accurate.
