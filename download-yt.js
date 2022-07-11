const youtubedl = require('youtube-dl-exec');
const fs = require('fs');

const downloadVideo = (url) => {
    youtubedl(
        url,
        { f: 'bestvideo[ext=mp4]', o: '%(title)s.%(ext)s' },
        {
            // dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true,
            restrictFilenames: true
        }
    ).then((output) => console.log(output));
};

const downloadAudio = (url) => {
    youtubedl(
        url,
        { f: 'bestaudio[ext=m4a]', o: '%(title)s.%(ext)s' },
        {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true,
            restrictFilenames: true
        }
    ).then((output) => console.log(output));
};

downloadVideo('https://www.youtube.com/watch?v=WF34N4gJAKE');
