import path from 'path';
import { app } from 'electron';
import fs from 'fs';

// Get the correct binary paths for both development and production
export const getBinaryPaths = () => {
    const isPackaged = app.isPackaged;
    const platform = process.platform;

    let ffmpegPath: string;
    let ytdlpPath: string;

    if (isPackaged) {
        // In packaged app, binaries should be in resources/bin/platform/
        const resourcesPath = process.resourcesPath;

        if (platform === 'win32') {
            ffmpegPath = path.join(resourcesPath, 'bin', 'win32', 'ffmpeg.exe');
            ytdlpPath = path.join(resourcesPath, 'bin', 'win32', 'yt-dlp.exe');
        } else if (platform === 'darwin') {
            ffmpegPath = path.join(resourcesPath, 'bin', 'darwin', 'ffmpeg');
            ytdlpPath = path.join(resourcesPath, 'bin', 'darwin', 'yt-dlp');
        } else {
            // Linux
            ffmpegPath = path.join(resourcesPath, 'bin', 'linux', 'ffmpeg');
            ytdlpPath = path.join(resourcesPath, 'bin', 'linux', 'yt-dlp');
        }
    } else {
        // In development, try to find system binaries
        if (platform === 'win32') {
            ffmpegPath = 'ffmpeg'; // Assume it's in PATH
            ytdlpPath = 'yt-dlp';
        } else if (platform === 'darwin') {
            // Try common macOS locations
            const commonPaths = [
                '/opt/homebrew/bin/ffmpeg',
                '/usr/local/bin/ffmpeg',
                'ffmpeg'
            ];
            ffmpegPath = commonPaths.find(p => fs.existsSync(p)) || 'ffmpeg';
            ytdlpPath = 'yt-dlp';
        } else {
            // Linux
            ffmpegPath = 'ffmpeg';
            ytdlpPath = 'yt-dlp';
        }
    }

    return {
        ffmpegPath,
        ytdlpPath,
        isPackaged
    };
};

// Check if required binaries exist
export const checkBinaries = () => {
    const { ffmpegPath, ytdlpPath, isPackaged } = getBinaryPaths();

    const checks = {
        ffmpeg: false,
        ytdlp: false
    };

    try {
        if (isPackaged) {
            checks.ffmpeg = fs.existsSync(ffmpegPath);
            checks.ytdlp = fs.existsSync(ytdlpPath);
        } else {
            // In development, just assume they're available
            checks.ffmpeg = true;
            checks.ytdlp = true;
        }
    } catch (error) {
        console.error('Error checking binaries:', error);
    }

    return checks;
};
