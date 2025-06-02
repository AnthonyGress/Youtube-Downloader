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
import youtubedl from 'youtube-dl-exec';
import { parseAndDownload } from './parseCSV';
import { checkForUpdates, startUpdate } from './utils/appUpdater';
import { safeLog } from './utils/safeLogger';
import { getBinaryPaths, checkBinaries } from './utils/binaryPaths';
import fs from 'fs';
import os from 'os';
import { getLogInfo } from './utils/safeLogger';

const isWin = process.platform === 'win32';
let username: any;
let downloadPath: string;
let bulkFilepath: string;
let customDownloadDirectory: string | null = null;

// Get binary paths for the current environment
const { ffmpegPath, ytdlpPath } = getBinaryPaths();

// Create symlinks without spaces to work around youtube-dl-exec path parsing issues
let symlinkYtdlpPath: string | null = null;
let symlinkFfmpegPath: string | null = null;

// Create custom youtube-dl-exec instances with correct binary paths
let customYoutubedl: any = null;

const createBinarySymlinks = () => {
    if (!app.isPackaged) return; // Only needed in packaged apps

    try {
        const tempDir = os.tmpdir();
        const symlinkDir = path.join(tempDir, 'youtube-downloader-bins');

        // Create directory if it doesn't exist
        if (!fs.existsSync(symlinkDir)) {
            fs.mkdirSync(symlinkDir, { recursive: true });
        }

        // Create symlink for yt-dlp
        if (ytdlpPath && fs.existsSync(ytdlpPath)) {
            symlinkYtdlpPath = path.join(symlinkDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

            // Remove existing symlink if it exists
            if (fs.existsSync(symlinkYtdlpPath)) {
                fs.unlinkSync(symlinkYtdlpPath);
            }

            fs.symlinkSync(ytdlpPath, symlinkYtdlpPath);
            safeLog('Created yt-dlp symlink:', symlinkYtdlpPath, '->', ytdlpPath);

            // Create custom youtube-dl-exec instance with symlinked binary
            const { create: createYoutubeDl } = require('youtube-dl-exec');
            customYoutubedl = createYoutubeDl(symlinkYtdlpPath);
            safeLog('Created custom youtube-dl-exec instance with symlinked binary');
        }

        // Create symlink for ffmpeg
        if (ffmpegPath && fs.existsSync(ffmpegPath)) {
            symlinkFfmpegPath = path.join(symlinkDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

            // Remove existing symlink if it exists
            if (fs.existsSync(symlinkFfmpegPath)) {
                fs.unlinkSync(symlinkFfmpegPath);
            }

            fs.symlinkSync(ffmpegPath, symlinkFfmpegPath);
            safeLog('Created ffmpeg symlink:', symlinkFfmpegPath, '->', ffmpegPath);
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

    exec(`mkdir C:\\Users\\${username}\\AppData\\Local\\Programs\\youtube-downloader\\resources\\app\\dist\\bin && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -o C:\\Users\\${username}\\AppData\\Local\\Programs\\youtube-downloader\\resources\\app\\dist\\bin\\yt-dlp.exe`, (err: string, stdout: string, stderr: string) => {
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
            downloadPath = `${baseDirectory}\\${folderName}\\%(title)s-%(id)s.%(ext)s`;
        } else {
            downloadPath = `${baseDirectory}\\%(title)s-%(id)s.%(ext)s`;
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

const downloadAudio = async (url: string, bestQuality = false) => {
    try {
        safeLog('=== AUDIO DOWNLOAD START ===');
        safeLog('URL:', url);
        safeLog('App packaged:', app.isPackaged);
        safeLog('Platform:', process.platform);
        safeLog('Download path:', downloadPath);
        safeLog('Custom directory:', customDownloadDirectory);

        const options: any = {
            format: 'bestaudio[ext=m4a]',
            output: downloadPath,
            // Add additional options for production stability
            preferFreeFormats: true,
            addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36']
        };

        // Choose which youtube-dl-exec instance to use
        const youtubedlInstance = customYoutubedl || youtubedl;
        safeLog('Using youtube-dl-exec instance:', customYoutubedl ? 'custom with symlinked binary' : 'default');

        if (customYoutubedl) {
            safeLog('Custom instance binary path:', symlinkYtdlpPath);
        }

        safeLog('Final options:', JSON.stringify(options, null, 2));

        // Check if youtube-dl-exec module is working
        safeLog('youtube-dl-exec instance type:', typeof youtubedlInstance);

        // Add timeout
        const timeoutMs = 300000; // 5 minutes
        safeLog('Starting download with timeout:', timeoutMs + 'ms');

        // Wrap youtube-dl-exec with more detailed error handling
        let downloadPromise;
        try {
            downloadPromise = youtubedlInstance(url, options);
        } catch (syncError: any) {
            safeLog('Synchronous error from youtube-dl-exec:', {
                message: syncError.message,
                stack: syncError.stack,
                name: syncError.name
            });
            throw syncError;
        }

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Download timeout after 5 minutes')), timeoutMs);
        });

        const res = await Promise.race([downloadPromise, timeoutPromise]);
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
            // Add additional options for production stability
            preferFreeFormats: true,
            addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36']
        };

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

        // Choose which youtube-dl-exec instance to use
        const youtubedlInstance = customYoutubedl || youtubedl;
        safeLog('Using youtube-dl-exec instance:', customYoutubedl ? 'custom with symlinked binary' : 'default');

        if (customYoutubedl) {
            safeLog('Custom instance binary path:', symlinkYtdlpPath);
        }

        const goodFormat = {
            ...baseOptions,
            format: 'bv*[height<=1080][vcodec^=avc]+ba[ext=m4a]/best'
        };

        const bestFormat = {
            ...baseOptions,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best'
        };

        const format = bestQuality ? bestFormat : goodFormat;
        safeLog('Final options:', JSON.stringify(format, null, 2));

        // Check if youtube-dl-exec module is working
        safeLog('youtube-dl-exec instance type:', typeof youtubedlInstance);

        // Add timeout
        const timeoutMs = 600000; // 10 minutes for video
        safeLog('Starting download with timeout:', timeoutMs + 'ms');

        // Wrap youtube-dl-exec with more detailed error handling
        let downloadPromise;
        try {
            downloadPromise = youtubedlInstance(url, format);
        } catch (syncError: any) {
            safeLog('Synchronous error from youtube-dl-exec:', {
                message: syncError.message,
                stack: syncError.stack,
                name: syncError.name
            });
            throw syncError;
        }

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Download timeout after 10 minutes')), timeoutMs);
        });

        const res = await Promise.race([downloadPromise, timeoutPromise]);
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
