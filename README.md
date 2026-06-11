# hsBingo.github.io?

## Installing as a phone app (PWA)

The site supports "Add to Home Screen" on both Android and iPhone, giving it a proper app icon.

**Android (Chrome)**
1. Open the site in Chrome
2. Tap the 3-dot menu → "Add to Home Screen" (Chrome may also prompt automatically)
3. Tap "Add" — the icon appears on your home screen

**iPhone (Safari)**
1. Open the site in **Safari** (must be Safari, not Chrome)
2. Tap the Share button (the box with an arrow pointing up, at the bottom of the screen)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" — the icon appears on your home screen

---

## Regenerating the app icons

If you replace the logo (`images/HS logo big.webp`), regenerate the PNG icons with:

```bash
npm install
node -e "
const sharp = require('sharp');
const src = 'images/HS logo big.webp';
Promise.all([
  sharp(src).resize(192, 192).png().toFile('icons/icon-192.png'),
  sharp(src).resize(512, 512).png().toFile('icons/icon-512.png'),
]).then(() => console.log('Icons created'));
"
```

This produces `icons/icon-192.png` and `icons/icon-512.png`, which are referenced by `manifest.json` and the iPhone `apple-touch-icon` tag in `index.html`.
