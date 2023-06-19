#!/bin/bash
OS="$(uname)"
UNAME_MACHINE="$(/usr/bin/uname -m)"
USER_PLATFORM="$OS $UNAME_MACHINE"
LATEST_VERSION=$(curl -s -L https://api.github.com/repos/anthonygress/mac-the-ripper/tags | grep '"name":' | head -1 | cut -d: -f2 | cut -c4-9)

install_app() {
    echo -e "\n---------------------- Installing Application ----------------------"
    echo -e "Installing latest version: $LATEST_VERSION on $USER_PLATFORM\n"

    if [[ "$USER_PLATFORM" == "Darwin arm64" ]]
    then
        curl -sL https://github.com/AnthonyGress/mac-the-ripper/releases/download/v${LATEST_VERSION}/Youtube-Downloader-${LATEST_VERSION}-arm64-mac.zip --output ~/Downloads/Youtube-Downloader.zip && unzip -qo ~/Downloads/Youtube-Downloader.zip -d /Applications
    elif [[ "$USER_PLATFORM" == "Darwin x86_64" ]]
    then
        curl -sL https://github.com/AnthonyGress/mac-the-ripper/releases/download/v${LATEST_VERSION}/Youtube-Downloader-${LATEST_VERSION}-mac.zip --output ~/Downloads/Youtube-Downloader.zip && unzip -qo ~/Downloads/Youtube-Downloader.zip -d /Applications
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
    mkdir /Applications/Youtube-Downloader.app/Contents/Resources/app/dist/bin

    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /Applications/Youtube-Downloader.app/Contents/Resources/app/dist/bin/yt-dlp && chmod a+rx /Applications/Youtube-Downloader.app/Contents/Resources/app/dist/bin/yt-dlp
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
    open -a Youtube-Downloader.app
elif [[ "$OS" == "Linux" ]]
then
    cd ~/Desktop && ./Youtube-Downloader-arm64.AppImage
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

