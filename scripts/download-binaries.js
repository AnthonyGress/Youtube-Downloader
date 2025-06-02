const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

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
                    execSync(`cd "${platformDir}" && unzip -o -j ffmpeg.zip "*/bin/ffmpeg.exe" && rm ffmpeg.zip`, { stdio: 'inherit' });

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
                    execSync(`cd "${platformDir}" && tar -xf ffmpeg.tar.xz --strip-components=2 "*/bin/ffmpeg" && rm ffmpeg.tar.xz`, { stdio: 'inherit' });
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

        console.log('\nBinary setup completed!');

    } catch (error) {
        console.error('Error setting up binaries:', error);
        process.exit(1);
    }
};

downloadBinariesForAllPlatforms();
