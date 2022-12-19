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
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import youtubedl from 'youtube-dl-exec';

const isWin = process.platform === 'win32';
let username: any;
let downloadPath: string;

if (isWin){
    username = process.env.USERNAME;
    downloadPath = `C:\\Users\\${username}\\Downloads\\%(title)s.%(ext)s`;

    const { exec } = require('child_process');
    console.log('windows setup');

    exec(`mkdir C:\\Users\\${username}\\AppData\\Local\\Programs\\mac-the-ripper\\resources\\app\\dist\\bin && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -o C:\\Users\\${username}\\AppData\\Local\\Programs\\mac-the-ripper\\resources\\app\\dist\\bin\\yt-dlp.exe`, (err: string, stdout: string, stderr: string) => {
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
    })
} else {
    downloadPath = '~/Downloads/%(title)s.%(ext)s';
}

export default class AppUpdater {
    constructor() {
        log.transports.file.level = 'info'
        autoUpdater.logger = log;
        autoUpdater.checkForUpdatesAndNotify();
    }
}


let mainWindow: BrowserWindow | null = null;

// listen for message from renderer
ipcMain.on('audioChannel', async (event, args) => {
    const url = args;
    try {
        const res = await youtubedl(
            url,
            { format: 'bestaudio[ext=m4a]', output: downloadPath },
        );
        event.reply('messageResponse', 'success');
    } catch (error: any) {
        console.log(error);
        event.reply('messageResponse', error.message);
    }
});

ipcMain.on('videoChannel', async (event, args) => {
    const url = args;
    try {

        const res = await youtubedl(
            url,
            { format: 'best', output: downloadPath, mergeOutputFormat: 'mp4' },
        );
        // console.log(res);
        event.reply('messageResponse', 'success')
    } catch (error: any) {
        console.log(error);
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

const installExtensions = async () => {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    return installer
        .default(
            extensions.map((name) => installer[name]),
            forceDownload
        )
        .catch(console.log);
};

const createWindow = async () => {
    if (isDevelopment) {
        await installExtensions();
    }

    const RESOURCES_PATH = app.isPackaged
        ? path.join(process.resourcesPath, 'assets')
        : path.join(__dirname, '../../assets');

    const getAssetPath = (...paths: string[]): string => {
        return path.join(RESOURCES_PATH, ...paths);
    };

    mainWindow = new BrowserWindow({
        show: false,
        width: 360,
        height: 640,
        icon: getAssetPath('icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
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
            mainWindow.webContents.send('startup', `Welcome to Mac The Ripper version ${app.getVersion()}`)
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();

    // Open urls in the user's browser
    mainWindow.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
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
    .catch(console.log);
