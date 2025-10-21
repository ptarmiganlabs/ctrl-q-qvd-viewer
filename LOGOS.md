# Logo Assets

This document describes the logo assets that should be added to the extension.

## Required Logos

### Ctrl-Q Logo

The Ctrl-Q logo is available in the following variations:

1. **Logo Symbol** (Green and orange molecular symbol)
   - Black background version
   - White/light background version

2. **Logo with Text** (Symbol + "ctrl-Q" text)
   - Black background version
   - White/light background version

### Ptarmigan Labs Logo

The Ptarmigan Labs logo with green text on dark background.

## Where to Add Logos

### For VS Code Marketplace

If publishing to the VS Code Marketplace, add the following to `package.json`:

```json
"icon": "assets/images/ctrl-q-icon.png"
```

The icon should be:
- 128x128 pixels minimum
- PNG format
- Transparent or solid background

### For README.md

You can add logos to the README by placing them in `assets/images/` and referencing them like:

```markdown
![Ctrl-Q Logo](assets/images/ctrl-q-logo.png)
```

## Recommended Directory Structure

```
assets/
  images/
    ctrl-q-icon.png          # VS Code marketplace icon (128x128)
    ctrl-q-logo-dark.png     # Logo for dark backgrounds
    ctrl-q-logo-light.png    # Logo for light backgrounds
    ptarmigan-labs-logo.png  # Ptarmigan Labs logo
```

## Source Files

The logos are available from the project sponsor. Contact [Ptarmigan Labs](https://ptarmiganlabs.com) for the official logo files.

Reference issue images:
- Ctrl-Q symbol: https://github.com/user-attachments/assets/242b245e-1d1d-4f36-aed3-b2ecd87ad212
- Ctrl-Q logo (light bg): https://github.com/user-attachments/assets/83799f7d-607e-4621-900d-490da4217b2f
- Ctrl-Q logo (dark bg): https://github.com/user-attachments/assets/713e66fe-44e5-4184-8407-029537e91506
- Ptarmigan Labs logo: https://github.com/user-attachments/assets/8962f471-133c-4fcb-a5de-bc1eec29f2e1
