// Universal safe logging functions to prevent EIO errors
import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configure electron-log for production with size limits and rotation
log.transports.file.level = 'info';
log.transports.console.level = 'info';

// Configure log file size limits and rotation
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB max file size

// Configure log format for better readability and efficiency
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Configure log archiving with timestamp
log.transports.file.archiveLog = (oldLogFile) => {
    // Archive old log files with timestamp
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
    const oldPath = oldLogFile.path;
    return oldPath.replace(/\.log$/, `-${timestamp}.log`);
};

// Configure log resolvePath to ensure proper directory structure
log.transports.file.resolvePath = () => {
    // Define log paths for different platforms
    let logDir;
    switch (process.platform) {
    case 'win32':
        logDir = path.join(os.homedir(), 'AppData', 'Roaming', 'youtube-downloader', 'logs');
        break;
    case 'darwin':
        logDir = path.join(os.homedir(), 'Library', 'Logs', 'youtube-downloader');
        break;
    default: // Linux and others
        logDir = path.join(os.homedir(), '.config', 'youtube-downloader', 'logs');
        break;
    }

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    return path.join(logDir, 'main.log');
};

// Keep only the last 5 archived log files
const cleanupOldLogs = () => {
    try {
        const logFile = log.transports.file.getFile();
        const logDir = path.dirname(logFile.path);
        const appName = path.basename(logFile.path, '.log');

        // Get all archived log files
        const files = fs.readdirSync(logDir);
        const archivedLogs = files
            .filter((file: string) => file.startsWith(appName) && file.includes('-') && file.endsWith('.log'))
            .map((file: string) => ({
                name: file,
                path: path.join(logDir, file),
                stat: fs.statSync(path.join(logDir, file))
            }))
            .sort((a: any, b: any) => b.stat.mtime.getTime() - a.stat.mtime.getTime()); // Sort by modification time, newest first

        // Keep only the 5 most recent archived logs
        if (archivedLogs.length > 5) {
            const logsToDelete = archivedLogs.slice(5);
            logsToDelete.forEach((logFile: any) => {
                try {
                    fs.unlinkSync(logFile.path);
                    console.log(`Deleted old log file: ${logFile.name}`);
                } catch (deleteError) {
                    console.error(`Failed to delete old log file ${logFile.name}:`, deleteError);
                }
            });
        }
    } catch (error) {
        console.error('Error cleaning up old logs:', error);
    }
};

// Clean up old logs on startup (only in production)
if (process.env.NODE_ENV === 'production') {
    // Delay cleanup to ensure log system is fully initialized
    setTimeout(cleanupOldLogs, 2000);

    // Also schedule periodic cleanup (every 24 hours)
    setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);
}

// Export log info for debugging
export const getLogInfo = () => {
    try {
        if (process.env.NODE_ENV === 'production') {
            const logFile = log.transports.file.getFile();
            return {
                logPath: logFile.path,
                maxSize: log.transports.file.maxSize,
                level: log.transports.file.level
            };
        }
        return { logPath: 'console', maxSize: 'N/A', level: 'console' };
    } catch (error) {
        return { error: 'Failed to get log info' };
    }
};

export const safeLog = (...args: any[]) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            // In production, use electron-log which writes to files
            log.info(...args);
        } else {
            // In development, use console.log
            if (process.stdout && process.stdout.writable) {
                console.log(...args);
            }
        }
    } catch (error) {
        // Silently ignore logging errors
    }
};

export const safeError = (...args: any[]) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            log.error(...args);
        } else {
            if (process.stderr && process.stderr.writable) {
                console.error(...args);
            }
        }
    } catch (error) {
        // Silently ignore logging errors
    }
};

export const safeWarn = (...args: any[]) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            log.warn(...args);
        } else {
            if (process.stderr && process.stderr.writable) {
                console.warn(...args);
            }
        }
    } catch (error) {
        // Silently ignore logging errors
    }
};
