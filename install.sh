#!/bin/bash
OS="$(uname)"
UNAME_MACHINE="$(/usr/bin/uname -m)"
USER_PLATFORM="$OS $UNAME_MACHINE"
LATEST_VERSION=$(curl -s -L https://api.github.com/repos/anthonygress/youtube-dl/tags | grep '"name":' | head -1 | cut -d: -f2 | cut -c4-8)

install_app() {
    echo -e "\n---------------------- Installing Application ----------------------"
    echo -e "Installing latest version: $LATEST_VERSION on $USER_PLATFORM\n"

    if [[ "$USER_PLATFORM" == "Darwin arm64" ]]
    then
        curl -sL https://github.com/AnthonyGress/youtube-dl/releases/download/v${LATEST_VERSION}/youtube-dl-${LATEST_VERSION}-arm64-mac.zip --output ~/Downloads/youtube-dl.zip && unzip -qo ~/Downloads/youtube-dl.zip -d /Applications
    elif [[ "$USER_PLATFORM" == "Darwin x86_64" ]]
    then
        curl -sL https://github.com/AnthonyGress/youtube-dl/releases/download/v${LATEST_VERSION}/youtube-dl-${LATEST_VERSION}-mac.zip --output ~/Downloads/youtube-dl.zip && unzip -qo ~/Downloads/youtube-dl.zip -d /Applications
    elif [[ "$USER_PLATFORM" == "Linux arm64" ]]
    then
         curl -sL https://github.com/AnthonyGress/youtube-dl/releases/download/v${LATEST_VERSION}/youtube-dl-${LATEST_VERSION}-arm64.AppImage --output ~/Desktop/youtube-dl-arm64.AppImage && chmod +x ~/Desktop/youtube-dl-arm64.AppImage
    elif [[ "$USER_PLATFORM" == "Linux x86_64" ]]
    then
         curl -sL https://github.com/AnthonyGress/youtube-dl/releases/download/v${LATEST_VERSION}/youtube-dl-${LATEST_VERSION}.AppImage --output ~/Desktop/youtube-dl.AppImage && chmod +x ~/Desktop/youtube-dl.AppImage
    else
        echo "OS not supported - please check the readme for install and support instructions"
        exit 1
    fi


}

install_adb() {
    echo -e "\n---------------------- Installing ADB ----------------------"

    if [[ "$OS" == "Darwin" ]]
    then
        curl -sL -o ~/Downloads/platform-tools-latest-darwin.zip https://dl.google.com/android/repository/platform-tools-latest-darwin.zip && unzip -qo ~/Downloads/platform-tools-latest-darwin.zip -d /Applications/youtube-dl.app/Contents/
    elif [[ "$OS" == "Linux" ]]
    then
        mkdir /usr/bin/youtube-dl
        curl -sL -o ~/Downloads/platform-tools-latest-darwin.zip https://dl.google.com/android/repository/platform-tools-latest-linux.zip && unzip -qo ~/Downloads/platform-tools-latest-darwin.zip -d /usr/bin/youtube-dl
    fi
}

cleanUp(){
    echo -e "\n---------------------- Cleaning Up ----------------------"
    rm ~/Downloads/platform-tools-latest-darwin.zip

    if [[ "$OS" == "Darwin" ]]
    then
        rm ~/Downloads/youtube-dl.zip
    fi
}

openApp(){
echo -e "\n---------------------- Opening App ----------------------"

if [[ "$OS" == "Darwin" ]]
then
    open -a youtube-dl.app
elif [[ "$OS" == "Linux" ]]
then
    cd ~/Desktop && ./youtube-dl-arm64.AppImage
fi
echo
}

#runtime
curl https://raw.githubusercontent.com/AnthonyGress/youtube-dl/main/assets/art.txt
install_app
sleep 2
openApp
cleanUp

