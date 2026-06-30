/* eslint global-require: off, no-console: off */
/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { spawn } from 'child_process';
import { parseAndDownload } from './parseCSV';
import { checkForUpdates, startUpdate } from './utils/appUpdater';
import { safeLog } from './utils/safeLogger';
import { getBinaryPaths, checkBinaries, getHomebrewPythonPath } from './utils/binaryPaths';
import fs from 'fs';
import os from 'os';
import { getLogInfo } from './utils/safeLogger';

const isWin = process.platform === 'win32';
let username: any;
let downloadPath: string;
let bulkFilepath: string;
let customDownloadDirectory: string | null = null;

// Get binary paths for the current environment
const { ffmpegPath, ytdlpPath, denoPath } = getBinaryPaths();

// Create symlinks without spaces to work around path parsing issues with spaces
let symlinkYtdlpPath: string | null = null;
let symlinkFfmpegPath: string | null = null;
let symlinkDenoPath: string | null = null;

// Build yt-dlp CLI args from an options object.
// Mirrors dargs({ useEquals: false }): camelCase -> --kebab-case, booleans become
// flags (true -> --flag, false -> --no-flag), arrays repeat the flag per value.
const buildYtdlpArgs = (options: Record<string, any>): string[] => {
    const args: string[] = [];

    const pushArg = (key: string, value?: string) => {
        const flag = '--' + key.replace(/[A-Z]/g, '-$&').toLowerCase();
        args.push(flag);
        if (value) args.push(value);
    };

    for (const [key, value] of Object.entries(options)) {
        if (value === undefined || value === null) continue;

        if (value === true) {
            pushArg(key);
        } else if (value === false) {
            args.push('--no-' + key.replace(/[A-Z]/g, '-$&').toLowerCase());
        } else if (typeof value === 'string') {
            pushArg(key, value);
        } else if (typeof value === 'number' && !Number.isNaN(value)) {
            pushArg(key, String(value));
        } else if (Array.isArray(value)) {
            for (const item of value) pushArg(key, String(item));
        }
    }

    return args;
};

// Run yt-dlp with the given options and a timeout. Resolves on exit code 0,
// rejects with an error carrying stderr/stdout/exitCode otherwise.
const runYtdlp = (
    binaryPath: string,
    url: string,
    options: Record<string, any>,
    timeoutMs: number
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const args = [url, ...buildYtdlpArgs(options)];
        let command = binaryPath;
        let commandArgs = args;

        if (process.platform === 'darwin' && path.isAbsolute(binaryPath)) {
            const pythonPath = getHomebrewPythonPath();
            if (!pythonPath) {
                reject(new Error(
                    'Homebrew Python 3.10 or newer is required. Install it with "brew install python".'
                ));
                return;
            }

            command = pythonPath;
            commandArgs = [binaryPath, ...args];
        }

        safeLog('Spawning yt-dlp:', command, commandArgs.join(' '));
        const child = spawn(command, commandArgs, { windowsHide: true });

        let stdout = '';
        let stderr = '';
        let finished = false;

        const timer = setTimeout(() => {
            if (finished) return;
            finished = true;
            child.kill('SIGKILL');
            reject(new Error(`Download timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('error', (err: any) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            reject(Object.assign(err, { stderr, stdout }));
        });

        child.on('close', (code) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(Object.assign(new Error(stderr || `yt-dlp exited with code ${code}`), {
                    stderr,
                    stdout,
                    exitCode: code
                }));
            }
        });
    });
};

const createBinarySymlinks = () => {
    // Create symlinks for both development and production to handle path issues
    const needsSymlinks = process.platform === 'win32' || app.isPackaged;

    safeLog('Symlink creation check:', {
        platform: process.platform,
        isPackaged: app.isPackaged,
        needsSymlinks,
        ytdlpPath,
        ffmpegPath
    });

    if (!needsSymlinks) return;

    try {
        const tempDir = os.tmpdir();
        const symlinkDir = path.join(tempDir, 'youtube-downloader-bins');

        safeLog('Symlink directory setup:', {
            tempDir,
            symlinkDir,
            symlinkDirExists: fs.existsSync(symlinkDir)
        });

        // Create directory if it doesn't exist
        if (!fs.existsSync(symlinkDir)) {
            fs.mkdirSync(symlinkDir, { recursive: true });
            safeLog('Created symlink directory:', symlinkDir);
        }

        // Create symlink for yt-dlp
        if (ytdlpPath && fs.existsSync(ytdlpPath)) {
            symlinkYtdlpPath = path.join(symlinkDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
            safeLog('Attempting to create yt-dlp symlink:', { from: ytdlpPath, to: symlinkYtdlpPath });

            // Remove existing symlink if it exists
            if (fs.existsSync(symlinkYtdlpPath)) {
                try {
                    fs.unlinkSync(symlinkYtdlpPath);
                    safeLog('Removed existing yt-dlp symlink');
                } catch (unlinkError: any) {
                    safeLog('Failed to remove existing yt-dlp symlink, continuing:', unlinkError.message);
                }
            }

            try {
                // On Windows, try regular symlink first (files don't need junction)
                if (process.platform === 'win32') {
                    fs.symlinkSync(ytdlpPath, symlinkYtdlpPath, 'file');
                } else {
                    fs.symlinkSync(ytdlpPath, symlinkYtdlpPath);
                }
                safeLog('Created yt-dlp symlink:', symlinkYtdlpPath, '->', ytdlpPath);
            } catch (symlinkError: any) {
                safeLog('Failed to create yt-dlp symlink:', symlinkError.message);
                // Try copying the binary instead
                try {
                    fs.copyFileSync(ytdlpPath, symlinkYtdlpPath);
                    safeLog('Created yt-dlp copy instead of symlink:', symlinkYtdlpPath);
                } catch (copyError: any) {
                    safeLog('Failed to copy yt-dlp binary:', copyError.message);
                    symlinkYtdlpPath = null;
                }
            }
        } else {
            safeLog('yt-dlp binary not found or invalid path:', { ytdlpPath, exists: ytdlpPath ? fs.existsSync(ytdlpPath) : false });
        }

        // Create symlink for ffmpeg
        if (ffmpegPath && fs.existsSync(ffmpegPath)) {
            symlinkFfmpegPath = path.join(symlinkDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
            safeLog('Attempting to create ffmpeg symlink:', { from: ffmpegPath, to: symlinkFfmpegPath });

            // Remove existing symlink if it exists
            if (fs.existsSync(symlinkFfmpegPath)) {
                try {
                    fs.unlinkSync(symlinkFfmpegPath);
                    safeLog('Removed existing ffmpeg symlink');
                } catch (unlinkError: any) {
                    safeLog('Failed to remove existing ffmpeg symlink, continuing:', unlinkError.message);
                }
            }

            try {
                // On Windows, try regular symlink first (files don't need junction)
                if (process.platform === 'win32') {
                    fs.symlinkSync(ffmpegPath, symlinkFfmpegPath, 'file');
                } else {
                    fs.symlinkSync(ffmpegPath, symlinkFfmpegPath);
                }
                safeLog('Created ffmpeg symlink:', symlinkFfmpegPath, '->', ffmpegPath);
            } catch (symlinkError: any) {
                safeLog('Failed to create ffmpeg symlink:', symlinkError.message);
                // Try copying the binary instead
                try {
                    fs.copyFileSync(ffmpegPath, symlinkFfmpegPath);
                    safeLog('Created ffmpeg copy instead of symlink:', symlinkFfmpegPath);
                } catch (copyError: any) {
                    safeLog('Failed to copy ffmpeg binary:', copyError.message);
                }
            }
        } else {
            safeLog('ffmpeg binary not found or invalid path:', { ffmpegPath, exists: ffmpegPath ? fs.existsSync(ffmpegPath) : false });
        }

        // Create symlink for deno (JS runtime for yt-dlp)
        if (denoPath && fs.existsSync(denoPath)) {
            symlinkDenoPath = path.join(symlinkDir, process.platform === 'win32' ? 'deno.exe' : 'deno');
            safeLog('Attempting to create deno symlink:', { from: denoPath, to: symlinkDenoPath });

            // Remove existing symlink if it exists
            if (fs.existsSync(symlinkDenoPath)) {
                try {
                    fs.unlinkSync(symlinkDenoPath);
                    safeLog('Removed existing deno symlink');
                } catch (unlinkError: any) {
                    safeLog('Failed to remove existing deno symlink, continuing:', unlinkError.message);
                }
            }

            try {
                if (process.platform === 'win32') {
                    fs.symlinkSync(denoPath, symlinkDenoPath, 'file');
                } else {
                    fs.symlinkSync(denoPath, symlinkDenoPath);
                }
                safeLog('Created deno symlink:', symlinkDenoPath, '->', denoPath);
            } catch (symlinkError: any) {
                safeLog('Failed to create deno symlink:', symlinkError.message);
                // Try copying the binary instead
                try {
                    fs.copyFileSync(denoPath, symlinkDenoPath);
                    safeLog('Created deno copy instead of symlink:', symlinkDenoPath);
                } catch (copyError: any) {
                    safeLog('Failed to copy deno binary:', copyError.message);
                    symlinkDenoPath = null;
                }
            }
        } else {
            safeLog('deno binary not found or invalid path:', { denoPath, exists: denoPath ? fs.existsSync(denoPath) : false });
        }
    } catch (error: any) {
        safeLog('Failed to create binary symlinks:', error.message);
        // Continue without symlinks - fall back to original paths
    }
};

if (isWin){
    username = process.env.USERNAME;
    downloadPath = `C:\\Users\\${username}\\Downloads\\%(title)s.%(ext)s`;

    const { exec } = require('child_process');
    safeLog('windows setup');

    exec(`mkdir C:\\Users\\${username}\\AppData\\Local\\Programs\\youtube-downloader\\resources\\app\\dist\\bin && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -o C:\\Users\\${username}\\AppData\\Local\\Programs\\youtube-downloader\\resources\\app\\dist\\bin\\yt-dlp.exe`, (_err: string, stdout: string, stderr: string) => {
        safeLog(`stdout: ${stdout}`);
        safeLog(`stderr: ${stderr}`);
    })
} else {
    downloadPath = '~/Downloads/%(title)s-%(id)s.%(ext)s';
}

const setDownloadPath = (folderName?: string, bulk?: boolean) => {
    const baseDirectory = customDownloadDirectory || (isWin ? `C:\\Users\\${username}\\Downloads` : '~/Downloads');

    if (isWin) {
        if (bulk) {
            // Windows: Use restricted filename template to avoid file system issues
            downloadPath = `${baseDirectory}\\${folderName}\\%(title).100s-%(id)s.%(ext)s`;
        } else {
            // Windows: Restrict filename length and sanitize for compatibility
            downloadPath = `${baseDirectory}\\%(title).100s-%(id)s.%(ext)s`;
        }
    } else {
        if (bulk) {
            downloadPath = `${baseDirectory}/${folderName}/%(title)s-%(id)s.%(ext)s`;
        } else {
            downloadPath = `${baseDirectory}/%(title)s-%(id)s.%(ext)s`;
        }
    }
}
export default class AppUpdater {
    constructor() {
        log.transports.file.level = 'info'
        autoUpdater.logger = log;
        autoUpdater.checkForUpdatesAndNotify();
    }
}


let mainWindow: BrowserWindow | null = null;

const downloadAudio = async (url: string, _bestQuality = false) => {
    try {
        safeLog('=== AUDIO DOWNLOAD START ===');
        safeLog('URL:', url);
        safeLog('App packaged:', app.isPackaged);
        safeLog('Platform:', process.platform);
        safeLog('Download path:', downloadPath);
        safeLog('Custom directory:', customDownloadDirectory);

        const options: any = {
            // Prefer m4a/aac audio: the bundled static ffmpeg only decodes aac/mp3/h264
            // (no opus/webm), so avoid yt-dlp's default opus/webm bestaudio
            format: 'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio/best',
            output: downloadPath,
            extractAudio: true,
            audioFormat: 'm4a',
            audioQuality: 0,
            ffmpegLocation: symlinkFfmpegPath || ffmpegPath,
            // Add additional options for production stability
            preferFreeFormats: true,
            noCheckCertificates: true,
            noUpdate: true,
            addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36']
        };

        // Provide deno as the JS runtime yt-dlp needs to solve YouTube JS challenges
        const effectiveDenoPath = symlinkDenoPath || denoPath;
        if (effectiveDenoPath) {
            options.jsRuntimes = `deno:${effectiveDenoPath}`;
            safeLog('Using deno JS runtime:', effectiveDenoPath);
        }

        // Windows-specific options for better file system compatibility
        if (isWin) {
            options.restrictFilenames = true; // Remove special characters from filenames
            options.windowsFilenames = true; // Use Windows-compatible filenames
            options.trimFilenames = 100; // Limit filename length to prevent path issues
        }

        const effectiveYtdlpPath = symlinkYtdlpPath || ytdlpPath;
        safeLog('Using yt-dlp binary:', effectiveYtdlpPath);
        safeLog('Final options:', JSON.stringify(options, null, 2));

        const timeoutMs = 300000; // 5 minutes
        safeLog('Starting download with timeout:', timeoutMs + 'ms');

        await runYtdlp(effectiveYtdlpPath, url, options, timeoutMs);
        safeLog('Audio download completed successfully');
        safeLog('=== AUDIO DOWNLOAD SUCCESS ===');
        return true;
    } catch (error: any) {
        safeLog('=== AUDIO DOWNLOAD ERROR ===');
        safeLog('Error type:', typeof error);
        safeLog('Error name:', error.name);
        safeLog('Error message:', error.message);
        safeLog('Error stack:', error.stack);

        // Log all available error properties
        const errorKeys = Object.keys(error);
        safeLog('Available error properties:', errorKeys);

        errorKeys.forEach(key => {
            if (key !== 'stack') { // Already logged above
                safeLog(`Error.${key}:`, error[key]);
            }
        });

        if (error.stderr) {
            safeLog('Error stderr:', error.stderr);
        }
        if (error.stdout) {
            safeLog('Error stdout:', error.stdout);
        }
        if (error.command) {
            safeLog('Failed command:', error.command);
        }
        if (error.spawnfile) {
            safeLog('Spawn file:', error.spawnfile);
        }
        if (error.code) {
            safeLog('Error code:', error.code);
        }
        if (error.errno) {
            safeLog('Error errno:', error.errno);
        }
        if (error.syscall) {
            safeLog('Error syscall:', error.syscall);
        }

        safeLog('Error details:', {
            message: error.message,
            url,
            downloadPath,
            ytdlpPath,
            isPackaged: app.isPackaged
        });
        safeLog('=== AUDIO DOWNLOAD ERROR END ===');

        return error.message || 'Unknown download error';
    }
}

const downloadVideo = async (url: string, bestQuality = false) => {
    try {
        safeLog('=== VIDEO DOWNLOAD START ===');
        safeLog('URL:', url);
        safeLog('Best quality:', bestQuality);
        safeLog('App packaged:', app.isPackaged);
        safeLog('Platform:', process.platform);
        safeLog('Download path:', downloadPath);
        safeLog('Custom directory:', customDownloadDirectory);

        const baseOptions: any = {
            output: downloadPath,
            mergeOutputFormat: 'mp4',
            // NOTE: do NOT set preferFreeFormats here — it biases yt-dlp toward
            // AV1/VP9, which QuickTime can't play. We want H.264 (avc1) + AAC.
            addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36']
        };

        // Windows-specific options for better file system compatibility
        if (isWin) {
            baseOptions.restrictFilenames = true; // Remove special characters from filenames
            baseOptions.windowsFilenames = true; // Use Windows-compatible filenames
            baseOptions.trimFilenames = 100; // Limit filename length to prevent path issues
        }

        // Add FFmpeg path if available
        const effectiveFfmpegPath = symlinkFfmpegPath || ffmpegPath;
        if (effectiveFfmpegPath && effectiveFfmpegPath !== 'ffmpeg') {
            baseOptions.ffmpegLocation = effectiveFfmpegPath;
            safeLog('Using ffmpeg path:', effectiveFfmpegPath);
            safeLog('Original FFmpeg path:', ffmpegPath);
            safeLog('Symlink FFmpeg path:', symlinkFfmpegPath);

            // Verify the binary exists
            const fs = require('fs');
            if (fs.existsSync(effectiveFfmpegPath)) {
                safeLog('FFmpeg binary verified at:', effectiveFfmpegPath);
            } else {
                safeLog('WARNING: FFmpeg binary not found at:', effectiveFfmpegPath);
                delete baseOptions.ffmpegLocation; // Fall back to system
            }
        } else {
            safeLog('Using system FFmpeg');
        }

        // Provide deno as the JS runtime yt-dlp needs to solve YouTube JS challenges
        const effectiveDenoPath = symlinkDenoPath || denoPath;
        if (effectiveDenoPath) {
            baseOptions.jsRuntimes = `deno:${effectiveDenoPath}`;
            safeLog('Using deno JS runtime:', effectiveDenoPath);
        }

        const effectiveYtdlpPath = symlinkYtdlpPath || ytdlpPath;
        safeLog('Using yt-dlp binary:', effectiveYtdlpPath);

        // Prefer H.264 (avc1) video + m4a/aac audio so the result plays in
        // QuickTime. Fall back to any mp4, then anything, if avc1 is unavailable.
        const goodFormat = {
            ...baseOptions,
            format: 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]/best',
            noCheckCertificates: true,
            noUpdate: true
        };

        const bestFormat = {
            ...baseOptions,
            format: 'bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            noCheckCertificates: true,
            noUpdate: true
        };

        const format = bestQuality ? bestFormat : goodFormat;
        safeLog('Final options:', JSON.stringify(format, null, 2));

        const timeoutMs = 600000; // 10 minutes for video
        safeLog('Starting download with timeout:', timeoutMs + 'ms');

        await runYtdlp(effectiveYtdlpPath, url, format, timeoutMs);
        safeLog('Video download completed successfully');
        safeLog('=== VIDEO DOWNLOAD SUCCESS ===');
        return true;
    } catch (error: any) {
        safeLog('=== VIDEO DOWNLOAD ERROR ===');
        safeLog('Error type:', typeof error);
        safeLog('Error name:', error.name);
        safeLog('Error message:', error.message);
        safeLog('Error stack:', error.stack);

        // Log all available error properties
        const errorKeys = Object.keys(error);
        safeLog('Available error properties:', errorKeys);

        errorKeys.forEach(key => {
            if (key !== 'stack') { // Already logged above
                safeLog(`Error.${key}:`, error[key]);
            }
        });

        if (error.stderr) {
            safeLog('Error stderr:', error.stderr);
        }
        if (error.stdout) {
            safeLog('Error stdout:', error.stdout);
        }
        if (error.command) {
            safeLog('Failed command:', error.command);
        }
        if (error.spawnfile) {
            safeLog('Spawn file:', error.spawnfile);
        }
        if (error.code) {
            safeLog('Error code:', error.code);
        }
        if (error.errno) {
            safeLog('Error errno:', error.errno);
        }
        if (error.syscall) {
            safeLog('Error syscall:', error.syscall);
        }

        safeLog('Error details:', {
            message: error.message,
            url,
            downloadPath,
            ffmpegPath,
            ytdlpPath,
            bestQuality,
            isPackaged: app.isPackaged
        });
        safeLog('=== VIDEO DOWNLOAD ERROR END ===');

        return error.message || 'Unknown download error';
    }
}

// listen for message from renderer
ipcMain.on('audioChannel', async (event, args) => {
    const url = args.url;
    const bestQuality = false;
    const directory = args.directory;
    safeLog(args);
    let downloadResponse: any;

    const notifyComplete = (response: any) => {
        safeLog(response);

        if (response === true) {
            event.reply('messageResponse', 'success');
        } else {
            if (response.urlsRejected) {
                event.reply('messageResponse', {urlsRejected: response.urlsRejected});
            }
            else {
                event.reply('messageResponse', response);
            }
        }
    }

    // Set custom directory if provided
    if (directory) {
        customDownloadDirectory = directory;
    }

    if (url) {
        setDownloadPath()
        downloadResponse = await downloadAudio(url)
        notifyComplete(downloadResponse);
    } else {
        bulkFilepath = args.file
        const bulk = true;
        if (bulkFilepath) {
            setDownloadPath('Youtube_Music_Downloads', bulk)
            parseAndDownload(bulkFilepath, bestQuality, downloadAudio, notifyComplete );
        }
    }


});

ipcMain.on('videoChannel', async (event, args) => {
    const url = args.url;
    const bestQuality = args.bestQuality;
    const directory = args.directory;
    safeLog('args', args);
    let downloadResponse: any;

    const notifyComplete = (response: any) => {
        safeLog(response);

        if (response === true) {
            event.reply('messageResponse', 'success');
        } else {
            if (response.urlsRejected) {
                event.reply('messageResponse', {urlsRejected: response.urlsRejected});
            }
            else {
                event.reply('messageResponse', response);
            }
        }
    }

    // Set custom directory if provided
    if (directory) {
        customDownloadDirectory = directory;
    }

    if (url) {
        setDownloadPath()
        downloadResponse = await downloadVideo(url, bestQuality)
        notifyComplete(downloadResponse);
    } else {
        bulkFilepath = args.file
        const bulk = true;
        if (bulkFilepath) {
            setDownloadPath('Youtube_Video_Downloads', bulk)
            parseAndDownload(bulkFilepath, bestQuality, downloadVideo, notifyComplete );
        }
    }
});

ipcMain.on('selectDirectory', async (event) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openDirectory'],
            title: 'Select Download Directory'
        });

        if (!result.canceled && result.filePaths.length > 0) {
            customDownloadDirectory = result.filePaths[0];
            event.reply('directorySelected', { success: true, path: customDownloadDirectory });
        } else {
            event.reply('directorySelected', { success: false, path: null });
        }
    } catch (error: any) {
        safeLog('Directory selection error:', error);
        event.reply('directorySelected', { success: false, error: error.message });
    }
});

ipcMain.on('communicationChannel', async (event, args) => {
    safeLog('hit coms');
    try {
        if (args.includes('restart')){
            event.reply('messageResponse', 'restarting');
            app.relaunch();
            app.exit();
        }

        if (args.includes('update')){
            safeLog('hit backend update');
            event.reply('messageResponse', 'starting update');
            startUpdate(event).then(() => {
                if (process.platform !== 'win32') {
                    event.reply('messageResponse', 'update complete');
                } else {
                    event.reply('messageResponse', 'win update downloaded');
                }
            });
        }
    } catch (error: any) {
        safeLog(error);
        event.reply('messageResponse', error.message);
    }
});

if (process.env.NODE_ENV === 'production') {
    const sourceMapSupport = require('source-map-support');
    sourceMapSupport.install();
}

const isDevelopment =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDevelopment) {
    require('electron-debug')();
}

// const installExtensions = async () => {
//     const installer = require('electron-devtools-installer');
//     const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
//     const extensions = ['REACT_DEVELOPER_TOOLS'];

//     return installer
//         .default(
//             extensions.map((name) => installer[name]),
//             forceDownload
//         )
//         .catch(console.log);
// };

const createWindow = async () => {
    // Create binary symlinks first (before checking binaries)
    createBinarySymlinks();

    // Check if binaries are available
    const binaryChecks = checkBinaries();
    safeLog('=== YOUTUBE DOWNLOADER STARTUP ===');
    safeLog('App version:', app.getVersion());
    safeLog('Electron version:', process.versions.electron);
    safeLog('Node version:', process.versions.node);
    safeLog('Platform:', process.platform);
    safeLog('Architecture:', process.arch);
    safeLog('App packaged:', app.isPackaged);

    // Log configuration information
    const logInfo = getLogInfo();
    safeLog('Log configuration:', logInfo);

    if (app.isPackaged) {
        safeLog('Log file location:', logInfo.logPath);
        safeLog('Max log file size:', `${(logInfo.maxSize as number) / (1024 * 1024)}MB`);
        safeLog('Log files are automatically rotated and old files are cleaned up');
        safeLog('To view logs, navigate to the above path in your file manager');
    }

    safeLog('Binary availability check:', binaryChecks);
    safeLog('Binary paths:', { ffmpegPath, ytdlpPath });
    safeLog('Symlink paths:', { symlinkFfmpegPath, symlinkYtdlpPath });

    if (!binaryChecks.ytdlp) {
        safeLog('Warning: yt-dlp binary not found. Downloads may fail.');
    }

    if (!binaryChecks.ffmpeg) {
        safeLog('Warning: FFmpeg binary not found. Video downloads may fail.');
    }

    safeLog('=== STARTUP COMPLETE ===');

    // if (isDevelopment) {
    //     await installExtensions();
    // }

    const RESOURCES_PATH = app.isPackaged
        ? path.join(process.resourcesPath, 'assets')
        : path.join(__dirname, '../../assets');

    const getAssetPath = (...paths: string[]): string => {
        return path.join(RESOURCES_PATH, ...paths);
    };

    mainWindow = new BrowserWindow({
        show: false,
        width: 360,
        height: 800,
        icon: getAssetPath('icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false,
            contextIsolation: true
        },
    });

    mainWindow.loadURL(resolveHtmlPath('index.html'));

    mainWindow.on('ready-to-show', () => {
        if (!mainWindow) {
            throw new Error('"mainWindow" is not defined');
        }
        if (process.env.START_MINIMIZED) {
            mainWindow.minimize();
        } else {
            mainWindow.show();
            checkForUpdates().then((result) => {
                const updateText = result ? '\n Update Available' : '';

                mainWindow?.webContents.send('startup', `Welcome to Youtube Downloader version ${app.getVersion()}${updateText}`);

            });
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();

    // Open urls in the user's browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Remove this if your app does not use auto updates
    // eslint-disable-next-line
//   new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app
    .whenReady()
    .then(() => {
        createWindow();
        app.on('activate', () => {
            // On macOS it's common to re-create a window in the app when the
            // dock icon is clicked and there are no other windows open.
            if (mainWindow === null) createWindow();
        });
    })
    .catch(safeLog);
