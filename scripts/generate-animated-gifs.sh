#!/bin/bash

# Script to generate HIGH QUALITY professional animated GIFs showing the QVD Viewer in action
# This version produces much sharper, higher resolution images

set -e

echo "=== Creating HIGH QUALITY Animated GIFs for QVD Viewer Extension ==="
echo ""

# Create output directories
mkdir -p media/screenshots media/gifs /tmp/frames

# Generate HIGH RESOLUTION screenshots from each state
echo "Step 1: Generating HIGH RESOLUTION screenshots from HTML states..."

# Using much higher resolution (1920x1200) and maximum quality
wkhtmltoimage --width 1920 --height 1200 --quality 100 --enable-local-file-access \
  media/demo-state1.html \
  /tmp/frames/state1.png
echo "  ✓ Screenshot 1: Metadata view (1920x1200, 100% quality)"

wkhtmltoimage --width 1920 --height 1400 --quality 100 --enable-local-file-access \
  media/demo-state2.html \
  /tmp/frames/state2.png
echo "  ✓ Screenshot 2: Fields view (1920x1400, 100% quality)"

wkhtmltoimage --width 1920 --height 1300 --quality 100 --enable-local-file-access \
  media/demo-state3.html \
  /tmp/frames/state3.png
echo "  ✓ Screenshot 3: Data preview (1920x1300, 100% quality)"

echo ""
echo "Step 2: Creating HIGH QUALITY animated GIF showing extension workflow..."

# Create animated GIF with MUCH higher quality
# Using larger resolution (1200x800) for sharper output
# More frames per state for smoother animation
convert \
  \( /tmp/frames/state1.png -resize 1200x800 -sharpen 0x1 \) -duplicate 20 \
  \( /tmp/frames/state2.png -resize 1200x800 -sharpen 0x1 \) -duplicate 20 \
  \( /tmp/frames/state3.png -resize 1200x800 -sharpen 0x1 \) -duplicate 20 \
  -delay 8 -loop 0 \
  /tmp/qvd-viewer-workflow.gif

echo "  ✓ Created high-resolution workflow animation"

echo ""
echo "Step 3: Optimizing GIF while maintaining quality..."

# Optimize but keep higher quality - use more colors and larger size
gifsicle -O3 --colors 256 --lossy=30 \
  /tmp/qvd-viewer-workflow.gif \
  -o media/gifs/qvd-viewer-in-action.gif

echo "  ✓ Optimized GIF (maintained high quality)"

echo ""
echo "Step 4: Creating individual high-quality screenshots..."

# Save high-quality screenshots with better compression
convert /tmp/frames/state1.png -resize 1400x -quality 92 -sharpen 0x0.5 \
  media/screenshots/metadata-view.png

convert /tmp/frames/state2.png -resize 1400x -quality 92 -sharpen 0x0.5 \
  media/screenshots/fields-view.png

convert /tmp/frames/state3.png -resize 1400x -quality 92 -sharpen 0x0.5 \
  media/screenshots/data-preview.png

# Create a smaller version for README with sharpening
convert /tmp/frames/state3.png -resize 1000x -quality 92 -sharpen 0x0.5 \
  media/screenshots/data-preview-small.png

echo "  ✓ Saved individual high-quality screenshots"

echo ""
echo "Step 5: Creating feature showcase GIF (data view with highlight)..."

# Create a simpler GIF focusing just on the data view - higher quality
convert \
  \( /tmp/frames/state3.png -resize 1000x700 -sharpen 0x1 \) -duplicate 25 \
  -delay 8 -loop 0 \
  /tmp/data-view.gif

gifsicle -O3 --colors 256 --lossy=30 \
  /tmp/data-view.gif \
  -o media/gifs/data-preview.gif

echo "  ✓ Created high-quality data preview GIF"

echo ""
echo "✅ All HIGH QUALITY visual assets created successfully!"
echo ""
echo "📁 Generated files:"
echo ""
echo "🎬 Animated GIFs (High Resolution):"
ls -lh media/gifs/*.gif | awk '{print "   ", $9, "(" $5 ")"}'
echo ""
echo "📸 Screenshots (High Quality):"
ls -lh media/screenshots/*.png | awk '{print "   ", $9, "(" $5 ")"}'
echo ""
echo "🎉 Ready to add to README.md!"
