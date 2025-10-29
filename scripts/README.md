# Demo Visual Generation Scripts

This directory contains scripts for generating demonstration visuals (animated GIFs and screenshots) for the Ctrl-Q QVD Viewer extension.

## Scripts

### create-demo-states.js
Creates multiple HTML files showing different states of the QVD Viewer extension:
- `demo-state1.html` - Metadata view
- `demo-state2.html` - Fields view
- `demo-state3.html` - Data preview

**Usage:**
```bash
node scripts/create-demo-states.js
```

### create-demo-visuals.js
Creates a single comprehensive HTML demo page showing all features.

**Usage:**
```bash
node scripts/create-demo-visuals.js
```

### generate-animated-gifs.sh
Converts the HTML demo states into:
- Animated GIFs showing the extension workflow
- High-quality PNG screenshots
- Optimized versions for web display

**Requirements:**
- wkhtmltoimage (for HTML to PNG conversion)
- ImageMagick (for image processing and GIF creation)
- gifsicle (for GIF optimization)

**Usage:**
```bash
bash scripts/generate-animated-gifs.sh
```

**Output:**
- `media/gifs/qvd-viewer-in-action.gif` - Main animated demo
- `media/gifs/data-preview.gif` - Data preview animation
- `media/screenshots/*.png` - Individual feature screenshots

### generate-visuals.sh
Legacy script for generating basic screenshots and simple animations.

## Generated Files

The scripts generate visual assets in:
- `media/gifs/` - Animated GIF demonstrations
- `media/screenshots/` - Static PNG screenshots

These files are:
- ✅ Included in the VS Code extension package (`.vscodeignore` allows them)
- ✅ Committed to the repository for README display
- ✅ Optimized for web display (< 100KB each)

## Regenerating Visuals

If you update the extension UI or want to refresh the demos:

1. Run the state generator:
   ```bash
   node scripts/create-demo-states.js
   ```

2. Generate GIFs and screenshots:
   ```bash
   bash scripts/generate-animated-gifs.sh
   ```

3. Clean up temporary files:
   ```bash
   rm media/demo-*.html
   ```

## Notes

- The HTML files (`demo-*.html`) are temporary build artifacts and are excluded from git via `.gitignore`
- Screenshots are optimized to ~50-80KB each for faster loading
- Animated GIFs use 256 colors and are optimized with gifsicle
- All visuals use the VS Code dark theme color scheme for consistency
