const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const zlib = require('zlib');
const { pipeline } = require('stream');

const binariesDir = path.join(__dirname, '..', 'binaries');

// Ensure binaries directory exists
if (!fs.existsSync(binariesDir)) {
    fs.mkdirSync(binariesDir, { recursive: true });
}

const currentPlatform = process.platform;
const currentArch = process.arch;

console.log(`Running on ${currentPlatform} ${currentArch}...`);
console.log('Downloading binaries for all target platforms...');

// Download function
const downloadFile = (url, destination) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destination);

        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirects
                return downloadFile(response.headers.location, destination).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });

            file.on('error', (err) => {
                fs.unlink(destination, () => { /* ignore unlink errors */ }); // Delete the file on error
                reject(err);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
};

// Make file executable
const makeExecutable = (filePath) => {
    if (currentPlatform !== 'win32') {
        try {
            execSync(`chmod +x "${filePath}"`);
            console.log(`Made ${filePath} executable`);
        } catch (error) {
            console.error(`Failed to make ${filePath} executable:`, error.message);
        }
    }
};

// Build static FFmpeg for macOS
const buildStaticFFmpegMac = async () => {
    console.log('\nBuilding static FFmpeg for macOS...');
    try {
        // Run our static FFmpeg build script
        execSync('node scripts/build-ffmpeg-static.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
        console.log('Static FFmpeg build completed!');
        return true;
    } catch (error) {
        console.error('Static FFmpeg build failed:', error.message);
        console.log('Will attempt to use system FFmpeg as fallback...');
        return false;
    }
};

// Cross-platform file extraction
const extractZip = async (zipPath, extractTo, targetFile, requireBinPath = true) => {
    const AdmZip = require('adm-zip');

    try {
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();

        // Find the target file in the zip
        const targetEntry = zipEntries.find(entry =>
            entry.entryName.endsWith(targetFile) &&
            (!requireBinPath || entry.entryName.includes('/bin/'))
        );

        if (targetEntry) {
            // Extract the specific file
            const targetPath = path.join(extractTo, path.basename(targetFile));
            zip.extractEntryTo(targetEntry, extractTo, false, true);

            // Rename if necessary
            const extractedPath = path.join(extractTo, targetEntry.entryName.split('/').pop());
            if (extractedPath !== targetPath) {
                fs.renameSync(extractedPath, targetPath);
            }

            console.log(`Extracted ${targetFile} to ${targetPath}`);
            return targetPath;
        } else {
            throw new Error(`${targetFile} not found in zip archive`);
        }
    } catch (error) {
        console.error(`Failed to extract ${targetFile}:`, error.message);
        throw error;
    } finally {
        // Clean up zip file
        try {
            fs.unlinkSync(zipPath);
        } catch (e) {
            console.log('Note: Could not remove zip file:', e.message);
        }
    }
};

const extractTarXz = async (tarPath, extractTo, targetFile) => {
    try {
        // Use tar command for Linux/macOS
        if (process.platform !== 'win32') {
            execSync(`cd "${extractTo}" && tar -xf "${path.basename(tarPath)}" --strip-components=2 "*/bin/${targetFile}" && rm "${path.basename(tarPath)}"`, { stdio: 'inherit', cwd: extractTo });
        } else {
            throw new Error('tar.xz extraction not supported on Windows');
        }
    } catch (error) {
        console.error(`Failed to extract ${targetFile} from tar.xz:`, error.message);
        throw error;
    }
};

// Deno release asset names per platform/arch (denoland/deno latest)
const DENO_BASE = 'https://github.com/denoland/deno/releases/latest/download';
const DENO_ASSETS = {
    win32: ['deno-x86_64-pc-windows-msvc.zip'],
    linux: ['deno-x86_64-unknown-linux-gnu.zip'],
    darwin: ['deno-aarch64-apple-darwin.zip', 'deno-x86_64-apple-darwin.zip']
};

// Download + extract a single deno zip, returning the path to the extracted binary
const fetchDenoSlice = async (asset, platformDir, outName, targetPlatform) => {
    const zipPath = path.join(platformDir, asset);
    await downloadFile(`${DENO_BASE}/${asset}`, zipPath);
    // The in-zip binary name depends on the TARGET platform, not the build host
    const denoFile = targetPlatform === 'win32' ? 'deno.exe' : 'deno';
    // deno binary sits at the zip root, not under /bin/
    await extractZip(zipPath, platformDir, denoFile, false);
    const extracted = path.join(platformDir, denoFile);
    const finalPath = path.join(platformDir, outName);
    if (extracted !== finalPath) {
        fs.renameSync(extracted, finalPath);
    }
    return finalPath;
};

// Download deno JS runtime for all platforms (required by yt-dlp for YouTube JS challenges)
const setupDeno = async () => {
    console.log('\nSetting up deno JS runtime...');

    for (const platformName of Object.keys(DENO_ASSETS)) {
        console.log(`\nSetting up deno for ${platformName}...`);

        const platformDir = path.join(binariesDir, platformName);
        if (!fs.existsSync(platformDir)) {
            fs.mkdirSync(platformDir, { recursive: true });
        }

        const denoOut = platformName === 'win32' ? 'deno.exe' : 'deno';
        const denoPath = path.join(platformDir, denoOut);

        try {
            if (platformName === 'darwin') {
                // macOS builds target both arm64 + x64; create a universal binary like ffmpeg/yt-dlp
                const arm64Path = await fetchDenoSlice(DENO_ASSETS.darwin[0], platformDir, 'deno-arm64', 'darwin');
                const x64Path = await fetchDenoSlice(DENO_ASSETS.darwin[1], platformDir, 'deno-x64', 'darwin');

                if (currentPlatform === 'darwin') {
                    try {
                        execSync(`lipo -create "${arm64Path}" "${x64Path}" -output "${denoPath}"`, { stdio: 'inherit' });
                        fs.unlinkSync(arm64Path);
                        fs.unlinkSync(x64Path);
                        console.log('Created universal deno binary');
                    } catch (lipoError) {
                        console.error('lipo failed, falling back to host-arch deno:', lipoError.message);
                        const hostSlice = currentArch === 'arm64' ? arm64Path : x64Path;
                        fs.renameSync(hostSlice, denoPath);
                        const otherSlice = currentArch === 'arm64' ? x64Path : arm64Path;
                        try { fs.unlinkSync(otherSlice); } catch (e) { /* ignore */ }
                    }
                } else {
                    // Cross-platform build host: keep arm64 slice as the deno binary
                    fs.renameSync(arm64Path, denoPath);
                    try { fs.unlinkSync(x64Path); } catch (e) { /* ignore */ }
                }
            } else {
                await fetchDenoSlice(DENO_ASSETS[platformName][0], platformDir, denoOut, platformName);
            }

            if (fs.existsSync(denoPath)) {
                makeExecutable(denoPath);
                console.log(`deno ready for ${platformName}`);
            } else {
                console.log(`deno not found for ${platformName} after extraction`);
            }
        } catch (error) {
            console.error(`Failed to setup deno for ${platformName}:`, error.message);
            console.log(`${platformName} downloads may fail without a JS runtime`);
        }
    }
};

const downloadBinariesForAllPlatforms = async () => {
    try {
        // Define all target platforms
        const platforms = [
            { name: 'win32', ytdlpFile: 'yt-dlp.exe', ffmpegFile: 'ffmpeg.exe' },
            { name: 'darwin', ytdlpFile: 'yt-dlp', ffmpegFile: 'ffmpeg' },
            { name: 'linux', ytdlpFile: 'yt-dlp', ffmpegFile: 'ffmpeg' }
        ];

        // Download yt-dlp for all platforms
        for (const platform of platforms) {
            console.log(`\nDownloading yt-dlp for ${platform.name}...`);

            const ytdlpUrl = platform.name === 'win32'
                ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
                : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

            const ytdlpPath = path.join(binariesDir, platform.name, platform.ytdlpFile);

            // Create platform directory
            const platformDir = path.join(binariesDir, platform.name);
            if (!fs.existsSync(platformDir)) {
                fs.mkdirSync(platformDir, { recursive: true });
            }

            try {
                await downloadFile(ytdlpUrl, ytdlpPath);
                makeExecutable(ytdlpPath);
                console.log(`yt-dlp downloaded for ${platform.name}`);
            } catch (error) {
                console.error(`Failed to download yt-dlp for ${platform.name}:`, error.message);
            }
        }

        // Download/Build FFmpeg for all platforms
        console.log('\nSetting up FFmpeg binaries...');

        // FFmpeg download URLs for different platforms
        const ffmpegUrls = {
            'win32': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
            'linux': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz'
        };

        for (const platform of platforms) {
            console.log(`\nSetting up FFmpeg for ${platform.name}...`);

            const platformDir = path.join(binariesDir, platform.name);
            if (!fs.existsSync(platformDir)) {
                fs.mkdirSync(platformDir, { recursive: true });
            }

            try {
                if (platform.name === 'win32') {
                    // Download and extract Windows FFmpeg
                    const zipPath = path.join(platformDir, 'ffmpeg.zip');
                    await downloadFile(ffmpegUrls.win32, zipPath);

                    // Extract ffmpeg.exe from the zip (force overwrite)
                    console.log('Extracting Windows FFmpeg...');
                    await extractZip(zipPath, platformDir, 'ffmpeg.exe');

                } else if (platform.name === 'darwin') {
                    // Build static FFmpeg for macOS (only if we're on macOS)
                    if (currentPlatform === 'darwin') {
                        console.log('Building static FFmpeg for macOS...');
                        const buildSuccess = await buildStaticFFmpegMac();

                        if (!buildSuccess) {
                            console.log('Static FFmpeg build failed, will use system FFmpeg at runtime');
                        }
                    } else {
                        // Cross-platform build: static FFmpeg build not supported
                        console.log('Cross-platform build: static FFmpeg build not supported on non-macOS systems');
                        console.log('macOS builds will use system FFmpeg at runtime');
                    }

                } else if (platform.name === 'linux') {
                    // Download and extract Linux FFmpeg
                    const tarPath = path.join(platformDir, 'ffmpeg.tar.xz');
                    await downloadFile(ffmpegUrls.linux, tarPath);

                    // Extract ffmpeg from the tar.xz
                    console.log('Extracting Linux FFmpeg...');
                    await extractTarXz(tarPath, platformDir, 'ffmpeg');
                }

                const ffmpegPath = path.join(platformDir, platform.ffmpegFile);
                if (fs.existsSync(ffmpegPath)) {
                    makeExecutable(ffmpegPath);
                    console.log(`FFmpeg ready for ${platform.name}`);
                } else {
                    console.log(`FFmpeg not found for ${platform.name}, will use system PATH at runtime`);
                }

            } catch (error) {
                console.error(`Failed to setup FFmpeg for ${platform.name}:`, error.message);
                console.log(`${platform.name} will fall back to system FFmpeg if available`);
            }
        }

        // Download deno JS runtime (required by yt-dlp for YouTube)
        await setupDeno();

        console.log('\nBinary setup completed!');

    } catch (error) {
        console.error('Error setting up binaries:', error);
        process.exit(1);
    }
};

downloadBinariesForAllPlatforms();
