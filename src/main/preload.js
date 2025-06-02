/* eslint-disable @typescript-eslint/no-var-requires */
const { contextBridge, ipcRenderer } = require('electron');
// sends message to main
const WINDOW_API = {
    audio: (args) => ipcRenderer.send('audioChannel', args),
    video: (args) => ipcRenderer.send('videoChannel', args),
    coms: (args) => ipcRenderer.send('communicationChannel', args),
    selectDirectory: () => ipcRenderer.send('selectDirectory'),
};

const windowLoaded = new Promise((resolve) => {
    window.onload = resolve;
});

ipcRenderer.on('startup', async (event, arg) => {
    // console.log(arg); // logs response from adbConnect
    await windowLoaded;
    // We use regular window.postMessage to transfer the port from the isolated
    // world to the main world.
    window.postMessage(arg, '*');
});

// listens for messages from main
ipcRenderer.on('messageResponse', async (event, arg) => {
    // console.log(arg); // logs response from adbConnect
    await windowLoaded;
    // We use regular window.postMessage to transfer the port from the isolated
    // world to the main world.
    window.postMessage(arg, '*');
});

// listens for directory selection response
ipcRenderer.on('directorySelected', async (event, arg) => {
    await windowLoaded;
    window.postMessage({ type: 'directorySelected', data: arg }, '*');
});

// window.api
contextBridge.exposeInMainWorld('api', WINDOW_API);
