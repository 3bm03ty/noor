# Noor - Quran Verse VS Code Extension

Get a verse (ayah) from the Quran during your coding session. Stay connected with the words of Allah.

## Features

- **Random Ayah**: Displays a random verse from the Quran at configurable intervals
- **Arabic & English**: Shows both Arabic (Uthmani) and English (Muhammad Asad) translation
- **Offline Mode**: Bundled Quran data (6,236 verses) for use without internet
- **Beautiful UI**: Webview popup with Amiri font for Arabic, proper RTL support, and readable typography
- **Actions**: Copy to clipboard, Next Ayah, Dismiss

## Commands

- **Noor: Show Random Ayah** (`Ctrl+Shift+K` / `Cmd+Shift+K`) - Show a random verse
- **Noor: Show Next Ayah** - Load another random verse
- **Noor: Dismiss Ayah Popup** (`Ctrl+Shift+A` / `Cmd+Shift+A`) - Close the popup

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `noor.language` | Display language (Arabic/English) | Arabic |
| `noor.repeatedEveryMinute` | Interval between automatic reminders (10, 15, 30, 60, 90, 120, 180) | 30 |
| `noor.showSuraName` | Show surah name and verse number | true |
| `noor.popupPosition` | Where the tab appears when display mode is Tab (center/sidebar) | center |
| `noor.displayMode` | **popup** = notification at bottom (no tab); **tab** = full panel in editor | popup |
| `noor.playAudio` | Auto-play recitation when ayah is displayed (tab mode only) | false |
| `noor.reciter` | Reciter for audio (ar.alafasy, ar.abdulbasitmurattal, ar.abdulsamad) | ar.alafasy |
| `noor.audioBitrate` | Audio quality in kbps (64, 128, 192) | 64 |

## Development

```bash
npm install
npm run build    # Fetches Quran data and generates verses.json
```

Press F5 in VS Code to launch the Extension Development Host and test.

## Data Sources

- **Online**: [Al-Quran Cloud API](https://api.alquran.cloud)
- **Offline**: Bundled verses from quran-uthmani (Arabic) and en.asad (English)

## License

MIT
