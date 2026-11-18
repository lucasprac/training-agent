# Brand assets

| File | Use |
|---|---|
| `../logo.svg` | Logo. A copy is the app favicon (`frontend/public/favicon.svg`). |
| `../banner-light.png`, `../banner-dark.png` | README banner (1280×420, rendered at 2×). |
| `../social-preview.png` | GitHub social preview (1280×640). Upload it in **Settings → General → Social preview**. |
| `../screenshots/` | README screenshots, light and dark (1440×900 at 1.5×). |

Colours come from the app theme in `frontend/src/index.css` (accent `#b5532a`, paper `#f6f3ee`).

## Render the banners again

Edit `banner.html`, then render it with headless Chrome. Run the commands from the repository root (Git Bash):

```bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
SRC="file:///$(pwd -W)/docs/assets/src/banner.html"
"$CHROME" --headless=new --hide-scrollbars --allow-file-access-from-files --user-data-dir="$(pwd -W)/.chrome-tmp" --window-size=1280,420 --force-device-scale-factor=2 --virtual-time-budget=3000 --screenshot="$(pwd -W)/docs/assets/banner-light.png" "$SRC?theme=light&size=banner"
"$CHROME" --headless=new --hide-scrollbars --allow-file-access-from-files --user-data-dir="$(pwd -W)/.chrome-tmp" --window-size=1280,420 --force-device-scale-factor=2 --virtual-time-budget=3000 --screenshot="$(pwd -W)/docs/assets/banner-dark.png" "$SRC?theme=dark&size=banner"
"$CHROME" --headless=new --hide-scrollbars --allow-file-access-from-files --user-data-dir="$(pwd -W)/.chrome-tmp" --window-size=1280,640 --force-device-scale-factor=1 --virtual-time-budget=3000 --screenshot="$(pwd -W)/docs/assets/social-preview.png" "$SRC?theme=light&size=social"
rm -rf .chrome-tmp
```

The screenshots come from the running app with the sample data (`SAMPLE_DATA=true`) and one finished session.
