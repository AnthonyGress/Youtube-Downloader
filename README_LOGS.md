# YouTube Downloader - Finding Logs

When YouTube Downloader is running in production (packaged app), all logs are written to files that you can access for debugging.

## Log Locations by Platform

### macOS
```
~/Library/Logs/youtube-downloader/main.log
```

### Windows
```
%USERPROFILE%\AppData\Roaming\youtube-downloader\logs\main.log
```

### Linux
```
~/.config/youtube-downloader/logs/main.log
```

## How to Access Logs

1. **Find the exact path**: When you first start the app, the exact log file path is written to the log itself
2. **Navigate to the folder**: Use your file manager (Finder on macOS, File Explorer on Windows, file manager on Linux)
3. **Open the log file**: Use any text editor to view the logs
