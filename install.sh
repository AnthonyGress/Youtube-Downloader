#!/bin/bash
OS="$(uname)"
UNAME_MACHINE="$(/usr/bin/uname -m)"
USER_PLATFORM="$OS $UNAME_MACHINE"
LATEST_VERSION_URL=$(curl -Ls -o /dev/null -w %{url_effective} https://github.com/AnthonyGress/Youtube-Downloader/releases/latest)
LATEST_VERSION=$(basename $LATEST_VERSION_URL)
LATEST_VERSION="${LATEST_VERSION:1}"

install_app() {
    echo -e "\n---------------------- Installing Application ----------------------"
    echo -e "Installing latest version: $LATEST_VERSION on $USER_PLATFORM\n"

    if [[ "$USER_PLATFORM" == "Darwin arm64" ]]
    then
        curl -sL https://github.com/AnthonyGress/mac-the-ripper/releases/download/v${LATEST_VERSION}/Youtube-Downloader-${LATEST_VERSION}-arm64-mac.zip --output ~/Downloads/Youtube-Downloader.zip && unzip -qo ~/Downloads/Youtube-Downloader.zip -d /Applications

        if ! command -v brew &> /dev/null; then
            echo "Homebrew not installed, installing"
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi

        brew install ffmpeg
    elif [[ "$USER_PLATFORM" == "Darwin x86_64" ]]
    then
        curl -sL https://github.com/AnthonyGress/mac-the-ripper/releases/download/v${LATEST_VERSION}/Youtube-Downloader-${LATEST_VERSION}-mac.zip --output ~/Downloads/Youtube-Downloader.zip && unzip -qo ~/Downloads/Youtube-Downloader.zip -d /Applications

        if ! command -v brew &> /dev/null; then
            echo "Homebrew not installed, installing"
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi

        brew install ffmpeg
    elif [[ "$USER_PLATFORM" == "Linux arm64" ]]
    then
         curl -sL https://github.com/AnthonyGress/mac-the-ripper/releases/download/v${LATEST_VERSION}/Youtube-Downloader-${LATEST_VERSION}-arm64.AppImage --output ~/Desktop/Youtube-Downloader-arm64.AppImage && chmod +x ~/Desktop/Youtube-Downloader-arm64.AppImage
    elif [[ "$USER_PLATFORM" == "Linux x86_64" ]]
    then
         curl -sL https://github.com/AnthonyGress/mac-the-ripper/releases/download/v${LATEST_VERSION}/Youtube-Downloader-${LATEST_VERSION}.AppImage --output ~/Desktop/Youtube-Downloader.AppImage && chmod +x ~/Desktop/Youtube-Downloader.AppImage
    else
        echo "OS not supported - please check the readme for install and support instructions"
        exit 1
    fi
}

install_yt-dl(){

    echo -e "\n---------------------- Installing yt-dlp ----------------------"
    mkdir /Applications/"Youtube Downloader".app/Contents/Resources/app/dist/bin

    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /Applications/"Youtube Downloader".app/Contents/Resources/app/dist/bin/yt-dlp && chmod a+rx /Applications/"Youtube Downloader".app/Contents/Resources/app/dist/bin/yt-dlp
}

cleanUp(){
    echo -e "\n---------------------- Cleaning Up ----------------------"

    if [[ "$OS" == "Darwin" ]]
    then
        rm ~/Downloads/Youtube-Downloader.zip
    fi
}

openApp(){
echo -e "\n---------------------- Opening App ----------------------"

if [[ "$OS" == "Darwin" ]]
then
    open -a /Applications/"Youtube Downloader.app"
elif [[ "$OS" == "Linux" ]]
then
    cd ~/Desktop && ./Youtube-Downloader.AppImage
fi
echo
}

#runtime
curl https://raw.githubusercontent.com/AnthonyGress/mac-the-ripper/main/assets/art.txt
install_app
sleep 2
install_yt-dl
openApp
cleanUp

