const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const binariesDir = path.join(__dirname, '..', 'binaries');
const buildDir = path.join(__dirname, '..', 'ffmpeg-build');

console.log('Building static FFmpeg for macOS...');

// Ensure directories exist
if (!fs.existsSync(binariesDir)) {
    fs.mkdirSync(binariesDir, { recursive: true });
}
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

const runCommand = (command, options = {}) => {
    console.log(`Running: ${command}`);
    try {
        return execSync(command, { stdio: 'inherit', ...options });
    } catch (error) {
        console.error(`Command failed: ${command}`);
        throw error;
    }
};

// Check and install nasm if needed
const ensureNasm = () => {
    console.log('Checking for nasm/yasm...');
    try {
        runCommand('which nasm');
        console.log('nasm found');
        return true;
    } catch (error) {
        try {
            runCommand('which yasm');
            console.log('yasm found');
            return true;
        } catch (error2) {
            console.log('nasm/yasm not found, attempting to install via Homebrew...');
            try {
                runCommand('brew install nasm');
                console.log('nasm installed successfully');
                return true;
            } catch (installError) {
                console.log('Failed to install nasm, will use --disable-x86asm');
                return false;
            }
        }
    }
};

const buildFFmpegForArch = async (arch) => {
    console.log(`\nBuilding FFmpeg for ${arch}...`);

    const archBuildDir = path.join(buildDir, arch);
    const outputDir = path.join(binariesDir, 'darwin');

    // Create directories
    if (!fs.existsSync(archBuildDir)) {
        fs.mkdirSync(archBuildDir, { recursive: true });
    }
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const sourceDir = path.join(archBuildDir, 'FFmpeg');

    try {
        // Check if source already exists
        if (!fs.existsSync(sourceDir)) {
            console.log('Cloning FFmpeg source...');
            runCommand(`git clone --depth 1 --branch release/6.1 https://github.com/FFmpeg/FFmpeg.git "${sourceDir}"`);
        }

        // Set architecture-specific flags
        const isArm64 = arch === 'arm64';
        const targetArch = isArm64 ? 'arm64' : 'x86_64';
        const minOSVersion = '10.15'; // macOS Catalina and later

        // Check for nasm availability
        const hasNasm = ensureNasm();

        // Configure build
        console.log(`Configuring FFmpeg for ${arch}...`);
        const configureFlags = [
            '--enable-static',
            '--disable-shared',
            '--disable-debug',
            '--disable-doc',
            '--disable-autodetect',
            '--enable-cross-compile',
            `--arch=${targetArch}`,
            '--target-os=darwin',
            '--cc=clang',
            '--cxx=clang++',
            `--extra-cflags="-arch ${targetArch} -mmacosx-version-min=${minOSVersion} -fno-stack-check"`,
            `--extra-ldflags="-arch ${targetArch} -mmacosx-version-min=${minOSVersion}"`,
            '--pkg-config-flags=--static',
            // Essential codecs and formats only
            '--disable-videotoolbox', // Disable hardware acceleration to avoid dependencies
            '--disable-audiotoolbox',
            '--disable-ffplay',
            '--disable-ffprobe',
            '--disable-network',
            '--disable-protocols',
            '--enable-protocol=file',
            '--enable-protocol=pipe',
            '--disable-devices',
            '--disable-indevs',
            '--disable-outdevs',
            // Minimal filter set for basic functionality
            '--disable-filters',
            '--enable-filter=aresample,scale,format,aformat,aac,copy',
            // Essential encoders/decoders
            '--disable-encoders',
            '--enable-encoder=aac,libmp3lame,h264,libx264',
            '--disable-decoders',
            '--enable-decoder=aac,mp3,h264',
            '--disable-muxers',
            '--enable-muxer=mp4,mp3,m4a',
            '--disable-demuxers',
            '--enable-demuxer=mov,mp4,m4a,mp3,aac',
            // Disable x86asm if nasm is not available
            ...(hasNasm ? [] : ['--disable-x86asm']),
            // Disable unnecessary components
            '--disable-bsfs',
            '--disable-parsers'
        ].join(' ');

        runCommand(`cd "${sourceDir}" && ./configure ${configureFlags}`, { cwd: sourceDir });

        // Build
        console.log(`Building FFmpeg for ${arch}...`);
        runCommand(`cd "${sourceDir}" && make -j$(sysctl -n hw.ncpu)`, { cwd: sourceDir });

        // Copy binary
        const binaryName = isArm64 ? 'ffmpeg-arm64' : 'ffmpeg-x64';
        const sourceBinary = path.join(sourceDir, 'ffmpeg');
        const targetBinary = path.join(outputDir, binaryName);

        if (fs.existsSync(sourceBinary)) {
            runCommand(`cp "${sourceBinary}" "${targetBinary}"`);
            runCommand(`chmod +x "${targetBinary}"`);

            // Verify the binary
            console.log(`Verifying ${binaryName}...`);
            runCommand(`file "${targetBinary}"`);
            runCommand(`"${targetBinary}" -version | head -1`);

            console.log(`${binaryName} built successfully!`);
        } else {
            throw new Error(`FFmpeg binary not found at ${sourceBinary}`);
        }

    } catch (error) {
        console.error(`Failed to build FFmpeg for ${arch}:`, error.message);
        throw error;
    }
};

const createUniversalBinary = () => {
    console.log('\nCreating universal binary...');

    const outputDir = path.join(binariesDir, 'darwin');
    const arm64Binary = path.join(outputDir, 'ffmpeg-arm64');
    const x64Binary = path.join(outputDir, 'ffmpeg-x64');
    const universalBinary = path.join(outputDir, 'ffmpeg');

    try {
        // Check if both binaries exist
        if (!fs.existsSync(arm64Binary) || !fs.existsSync(x64Binary)) {
            console.log('Missing architecture binaries, cannot create universal binary');
            return;
        }

        // Create universal binary using lipo
        runCommand(`lipo -create "${x64Binary}" "${arm64Binary}" -output "${universalBinary}"`);
        runCommand(`chmod +x "${universalBinary}"`);

        // Verify universal binary
        console.log('Verifying universal binary...');
        runCommand(`file "${universalBinary}"`);
        runCommand(`lipo -info "${universalBinary}"`);

        console.log('Universal FFmpeg binary created!');

        // Cleanup individual architecture binaries
        fs.unlinkSync(arm64Binary);
        fs.unlinkSync(x64Binary);

    } catch (error) {
        console.error('Failed to create universal binary:', error.message);
        // Keep individual binaries if universal creation fails
    }
};

const buildStaticFFmpeg = async () => {
    try {
        // Check if we're on macOS
        if (process.platform !== 'darwin') {
            console.log('This script is designed to run on macOS only');
            return;
        }

        // Check for required tools
        console.log('Checking build requirements...');
        runCommand('which git');
        runCommand('which clang');
        runCommand('which make');
        runCommand('which lipo');

        // Build for both architectures
        await buildFFmpegForArch('x64');
        await buildFFmpegForArch('arm64');

        // Create universal binary
        createUniversalBinary();

        console.log('\n Static FFmpeg build completed successfully!');

    } catch (error) {
        console.error('Build failed:', error.message);
        process.exit(1);
    }
};

// Run the build
buildStaticFFmpeg();
