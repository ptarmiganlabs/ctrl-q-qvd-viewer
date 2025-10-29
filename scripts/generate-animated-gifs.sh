#!/bin/bash

# Script to generate professional animated GIFs showing the QVD Viewer in action

set -e

echo "=== Creating Professional Animated GIFs for QVD Viewer Extension ==="
echo ""

# Create output directories
mkdir -p media/screenshots media/gifs /tmp/frames

# Generate screenshots from each state
echo "Step 1: Generating screenshots from HTML states..."

wkhtmltoimage --width 1400 --height 900 --quality 95 \
  media/demo-state1.html \
  /tmp/frames/state1.png
echo "  ✓ Screenshot 1: Metadata view"

wkhtmltoimage --width 1400 --height 1100 --quality 95 \
  media/demo-state2.html \
  /tmp/frames/state2.png
echo "  ✓ Screenshot 2: Fields view"

wkhtmltoimage --width 1400 --height 1000 --quality 95 \
  media/demo-state3.html \
  /tmp/frames/state3.png
echo "  ✓ Screenshot 3: Data preview"

echo ""
echo "Step 2: Creating animated GIF showing extension workflow..."

# Create animated GIF: State 1 -> State 2 -> State 3
# Each state shows for 1.5 seconds, with smooth transitions
convert \
  \( /tmp/frames/state1.png -resize 900x600 \) -duplicate 15 \
  \( /tmp/frames/state2.png -resize 900x600 \) -duplicate 15 \
  \( /tmp/frames/state3.png -resize 900x600 \) -duplicate 15 \
  -delay 10 -loop 0 \
  /tmp/qvd-viewer-workflow.gif

echo "  ✓ Created workflow animation"

echo ""
echo "Step 3: Optimizing GIF for web..."

gifsicle -O3 --colors 256 --resize-width 800 \
  /tmp/qvd-viewer-workflow.gif \
  -o media/gifs/qvd-viewer-in-action.gif

echo "  ✓ Optimized GIF"

echo ""
echo "Step 4: Creating individual high-quality screenshots..."

# Save high-quality screenshots
cp /tmp/frames/state1.png media/screenshots/metadata-view.png
cp /tmp/frames/state2.png media/screenshots/fields-view.png
cp /tmp/frames/state3.png media/screenshots/data-preview.png

# Create a smaller version for README
convert /tmp/frames/state3.png -resize 800x \
  media/screenshots/data-preview-small.png

echo "  ✓ Saved individual screenshots"

echo ""
echo "Step 5: Creating feature showcase GIF (data view with highlight)..."

# Create a simpler GIF focusing just on the data view
convert \
  \( /tmp/frames/state3.png -resize 800x600 \) -duplicate 20 \
  -delay 10 -loop 0 \
  /tmp/data-view.gif

gifsicle -O3 --colors 256 \
  /tmp/data-view.gif \
  -o media/gifs/data-preview.gif

echo "  ✓ Created data preview GIF"

echo ""
echo "✅ All visual assets created successfully!"
echo ""
echo "📁 Generated files:"
echo ""
echo "🎬 Animated GIFs:"
ls -lh media/gifs/*.gif | awk '{print "   ", $9, "(" $5 ")"}'
echo ""
echo "📸 Screenshots:"
ls -lh media/screenshots/*.png | awk '{print "   ", $9, "(" $5 ")"}'
echo ""
echo "🎉 Ready to add to README.md!"
