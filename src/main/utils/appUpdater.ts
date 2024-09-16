// import log from 'electron-log';
// import { autoUpdater } from 'electron-updater';
import { IpcMainEvent } from 'electron';
import { spawn } from 'node:child_process';
import { Octokit } from 'octokit';
import { downloadFile } from './downloadFile';
import packageJson from '../../../release/app/package.json';
import semverCompare from 'semver/functions/compare';
import fs from 'fs';
import { USERNAME, USER_OS } from '../constants';
import { execPromise } from './executeCmd';

// Cannot use updater unless codesigning with paid credentials for macOS
// export default class AppUpdater {
//     constructor() {
//         log.transports.file.level = 'info'
//         autoUpdater.logger = log;
//         autoUpdater.checkForUpdatesAndNotify();
//     }
// }

export const checkForUpdates = async () => {
    let updateAvailable = false;
    const octokit = new Octokit();

    const res = await octokit.request('GET /repos/{owner}/{repo}/releases/latest', {
        owner: 'AnthonyGress',
        repo: 'Youtube-Downloader',
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });

    const latestVersion = res.data.name;
    const runningVersion = packageJson.version;

    if (latestVersion){
        const newVersionAvailable = semverCompare(latestVersion, runningVersion);
        console.log('latest version', latestVersion);
        console.log('current', runningVersion);


        if (newVersionAvailable === 1) {
            updateAvailable = true;
        }
    }
    return updateAvailable;
};


export const startUpdate = async (event: IpcMainEvent) => {
    if (USER_OS === 'win32') {
        updateWindows(event);
    } else {
        console.log('hit nix update');
        await nixUpdate();
    }
};

export const updateWindows = (event: IpcMainEvent) => {

    const downloadPathWin = `C:\\Users\\${USERNAME}\\Downloads`;
    console.log('running windows update');

    fs.mkdir(`${downloadPathWin}\\Youtube-Downloader-Update\\`, (err) => {
        if (err) console.log(err);
    });

    downloadFile(`https://github.com/anthonygress/${packageJson.name}/releases/latest/download/${packageJson.name}-setup.exe`, `${downloadPathWin}\\Youtube-Downloader-Update\\Youtube-Downloader-Update.exe`).then(() => {
        event.reply('coms', 'win update downloaded');
        spawn('explorer', [`${downloadPathWin}\\Youtube-Downloader-Update\\`], { detached: true }).unref();
    });
};


export const nixUpdate = async () => {
    let updateCompleted = false;
    console.log('running *nix update');
    await execPromise('/bin/bash -c "$(curl -sL https://raw.githubusercontent.com/AnthonyGress/Youtube-Downloader/main/install.sh)"');
    updateCompleted = true;
    return updateCompleted;
};
