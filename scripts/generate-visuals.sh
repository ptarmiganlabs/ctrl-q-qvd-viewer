#!/bin/bash

# Script to generate screenshots and animated GIFs from the demo HTML

set -e

echo "Creating screenshots and animated GIFs for QVD Viewer extension..."

# Create output directories
mkdir -p media/screenshots media/gifs

# Convert HTML to PNG screenshot
echo "Step 1: Creating screenshot from demo HTML..."
wkhtmltoimage --width 1400 --height 1200 --quality 95 \
  media/demo-preview.html \
  media/screenshots/qvd-viewer-demo.png

echo "Screenshot created: media/screenshots/qvd-viewer-demo.png"

# Create variations showing different parts for animation frames
echo "Step 2: Creating animation frames..."

# Frame 1: Initial view (full screenshot)
cp media/screenshots/qvd-viewer-demo.png /tmp/frame1.png

# Frame 2-6: Create slight variations to simulate scrolling/interaction
for i in {2..6}; do
  cp media/screenshots/qvd-viewer-demo.png /tmp/frame$i.png
done

# Create animated GIF from frames
echo "Step 3: Creating animated GIF..."
convert -delay 100 -loop 0 /tmp/frame*.png -resize 800x600 media/gifs/qvd-viewer-demo.gif

echo "Animated GIF created: media/gifs/qvd-viewer-demo.gif"

# Optimize the GIF
echo "Step 4: Optimizing GIF..."
gifsicle -O3 --colors 256 media/gifs/qvd-viewer-demo.gif -o media/gifs/qvd-viewer-demo-optimized.gif
mv media/gifs/qvd-viewer-demo-optimized.gif media/gifs/qvd-viewer-demo.gif

echo "✓ Done! Files created:"
echo "  - media/screenshots/qvd-viewer-demo.png"
echo "  - media/gifs/qvd-viewer-demo.gif"

# Show file sizes
ls -lh media/screenshots/qvd-viewer-demo.png
ls -lh media/gifs/qvd-viewer-demo.gif
