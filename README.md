# Youtube Downloader
A simple cross platform youtube downloader for Mac, Windows, and Linux computers

![YoutubeDownloader](https://github.com/AnthonyGress/mac-the-ripper/assets/70029654/c473288f-d18c-4232-8e1c-3cc2a79a9011)

# Install

## Mac & Linux

Copy and paste this into the Terminal App

`/bin/bash -c "$(curl -sL https://raw.githubusercontent.com/AnthonyGress/youtube-dl/main/install.sh)"`

<br>

## Windows

Use the installer from the latest Release named `Youtube-Downloader-Setup-${VERSION}.exe`

[Click to Download](https://github.com/AnthonyGress/mac-the-ripper/releases/latest/)

<br>

## Usage

Simply input a youtube url and click a download button. For now, the files will always output to your downloads folder.

For CSV files, the file needs to look like this

`example.csv`
```
https://www.youtube.com/watch?v=Axd3LP1k6NI,
https://www.youtube.com/watch?v=ggrhOD24tFQ,
https://www.youtube.com/watch?v=-95EAvUfJos,
https://www.youtube.com/watch?v=P13hELgxJHw,
```

> NOTE: **There must be a comma on the last line or it will throw and error**

<br>

<hr>

Built using Electron React Boilerplate
