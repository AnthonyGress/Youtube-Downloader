import path from 'path';
import { app } from 'electron';
import fs from 'fs';

// Safe logging function that works in both development and production
const debugLog = (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
        console.log(message, data || '');
    }
};

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
        // In development, look for downloaded binaries first, then fall back to system
        // More robust project root calculation
        const currentDir = __dirname;
        debugLog('Current __dirname:', currentDir);

        // Calculate project root by going up from src/main/utils to project root
        const projectRoot = path.resolve(__dirname, '..', '..', '..');
        const binariesDir = path.join(projectRoot, 'binaries');

        debugLog('Calculated project root:', projectRoot);
        debugLog('Binaries directory:', binariesDir);

        try {
            debugLog('Binaries directory exists:', fs.existsSync(binariesDir));
        } catch (error) {
            debugLog('Error checking binaries directory:', error);
        }

        if (platform === 'win32') {
            const devFfmpegPath = path.join(binariesDir, 'win32', 'ffmpeg.exe');
            const devYtdlpPath = path.join(binariesDir, 'win32', 'yt-dlp.exe');

            debugLog('Windows dev ffmpeg path:', devFfmpegPath);
            debugLog('Windows dev yt-dlp path:', devYtdlpPath);

            try {
                debugLog('Windows dev ffmpeg exists:', fs.existsSync(devFfmpegPath));
                debugLog('Windows dev yt-dlp exists:', fs.existsSync(devYtdlpPath));
            } catch (error) {
                debugLog('Error checking Windows binaries:', error);
            }

            // Use downloaded binaries if they exist, otherwise fall back to system
            ffmpegPath = devFfmpegPath;
            ytdlpPath = devYtdlpPath;

            // Double-check existence before setting final paths
            try {
                if (!fs.existsSync(devFfmpegPath)) {
                    ffmpegPath = 'ffmpeg';
                    debugLog('Windows FFmpeg not found, falling back to system');
                }
                if (!fs.existsSync(devYtdlpPath)) {
                    ytdlpPath = 'yt-dlp';
                    debugLog('Windows yt-dlp not found, falling back to system');
                }
            } catch (error) {
                debugLog('Error during final Windows binary check:', error);
                ffmpegPath = 'ffmpeg';
                ytdlpPath = 'yt-dlp';
            }
        } else if (platform === 'darwin') {
            const devFfmpegPath = path.join(binariesDir, 'darwin', 'ffmpeg');
            const devYtdlpPath = path.join(binariesDir, 'darwin', 'yt-dlp');

            debugLog('macOS dev ffmpeg path:', devFfmpegPath);
            debugLog('macOS dev yt-dlp path:', devYtdlpPath);

            try {
                debugLog('macOS dev ffmpeg exists:', fs.existsSync(devFfmpegPath));
                debugLog('macOS dev yt-dlp exists:', fs.existsSync(devYtdlpPath));
            } catch (error) {
                debugLog('Error checking macOS binaries:', error);
            }

            // For macOS, try downloaded binaries, then common system locations
            try {
                if (fs.existsSync(devFfmpegPath)) {
                    ffmpegPath = devFfmpegPath;
                } else {
                    const commonPaths = [
                        '/opt/homebrew/bin/ffmpeg',
                        '/usr/local/bin/ffmpeg',
                        'ffmpeg'
                    ];
                    ffmpegPath = commonPaths.find(p => {
                        try {
                            return fs.existsSync(p);
                        } catch {
                            return false;
                        }
                    }) || 'ffmpeg';
                }

                ytdlpPath = fs.existsSync(devYtdlpPath) ? devYtdlpPath : 'yt-dlp';
            } catch (error) {
                debugLog('Error during macOS binary setup:', error);
                ffmpegPath = 'ffmpeg';
                ytdlpPath = 'yt-dlp';
            }
        } else {
            // Linux
            const devFfmpegPath = path.join(binariesDir, 'linux', 'ffmpeg');
            const devYtdlpPath = path.join(binariesDir, 'linux', 'yt-dlp');

            debugLog('Linux dev ffmpeg path:', devFfmpegPath);
            debugLog('Linux dev yt-dlp path:', devYtdlpPath);

            try {
                debugLog('Linux dev ffmpeg exists:', fs.existsSync(devFfmpegPath));
                debugLog('Linux dev yt-dlp exists:', fs.existsSync(devYtdlpPath));

                ffmpegPath = fs.existsSync(devFfmpegPath) ? devFfmpegPath : 'ffmpeg';
                ytdlpPath = fs.existsSync(devYtdlpPath) ? devYtdlpPath : 'yt-dlp';
            } catch (error) {
                debugLog('Error during Linux binary setup:', error);
                ffmpegPath = 'ffmpeg';
                ytdlpPath = 'yt-dlp';
            }
        }
    }

    debugLog('Final binary paths:', { ffmpegPath, ytdlpPath, platform, isPackaged });

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
        // Check if the binary files exist (both for packaged and development)
        if (ffmpegPath.includes('/') || ffmpegPath.includes('\\')) {
            // Path contains directory separators, check if file exists
            try {
                checks.ffmpeg = fs.existsSync(ffmpegPath);
            } catch (error) {
                debugLog('Error checking ffmpeg path:', error);
                checks.ffmpeg = false;
            }
        } else {
            // Just a command name, assume it's in PATH (for fallback cases)
            checks.ffmpeg = true;
        }

        if (ytdlpPath.includes('/') || ytdlpPath.includes('\\')) {
            // Path contains directory separators, check if file exists
            try {
                checks.ytdlp = fs.existsSync(ytdlpPath);
            } catch (error) {
                debugLog('Error checking yt-dlp path:', error);
                checks.ytdlp = false;
            }
        } else {
            // Just a command name, assume it's in PATH (for fallback cases)
            checks.ytdlp = true;
        }

        debugLog('Binary existence checks:', checks);
    } catch (error) {
        debugLog('Error checking binaries:', error);
    }

    return checks;
};
