<p align="center">
  <!-- Release -->
  <img alt="Release" src="https://img.shields.io/github/v/release/f-io/pi-carplay?label=release"> &nbsp;&nbsp;&nbsp;
  <!-- MAIN -->
  <img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/f-io/pi-carplay/version/.github/badges/main-version.json">
  <img alt="TS Main" src="https://img.shields.io/github/actions/workflow/status/f-io/pi-carplay/typecheck.yml?branch=main&label=TS%20main&style=flat">
  <img alt="Build Main" src="https://img.shields.io/github/actions/workflow/status/f-io/pi-carplay/build.yml?branch=main&label=build%20main&style=flat"> &nbsp;&nbsp;&nbsp;
  <!-- DEV -->
  <img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/f-io/pi-carplay/version/.github/badges/dev-version.json">
  <img alt="TS Dev" src="https://img.shields.io/github/actions/workflow/status/f-io/pi-carplay/typecheck.yml?branch=dev&label=TS%20dev&style=flat">
  <img alt="Build Dev" src="https://img.shields.io/github/actions/workflow/status/f-io/pi-carplay/build.yml?branch=dev&label=build%20dev&style=flat">
</p>

# pi-carplay

pi-carplay brings Apple CarPlay and Android Auto to the Raspberry Pi, with support for Linux (ARM/x86) and macOS (ARM) as well. It is a standalone Electron app, optimized for embedded setups and ultra-low-resolution OEM displays.  

> **Requirements:** A Carlinkit **CPC200-CCPA** (wireless & wired) or **CPC200-CCPW** (wired only) adapter.
## Installation (Raspberry Pi OS)

```bash
curl -LO https://raw.githubusercontent.com/f-io/pi-carplay/main/setup-pi.sh
sudo chmod +x setup-pi.sh
./setup-pi.sh
```

The `setup-pi.sh` script performs the following tasks:

1. check for required tools: curl and xdg-user-dir
2. configures udev rules to ensure the proper access rights for the CarPlay dongle
3. downloads the latest AppImage
4. creates an autostart entry, so the application will launch automatically on boot
5. creates a desktop shortcut for easy access to the application

*Do not run this script on other Linux distributions.*

## Images
<p align="center">
  <img src="documentation/images/carplay.png"
       alt="CarPlay"
       width="45%" />
</p>

<p align="center">
  <img src="documentation/images/settings.png"
       alt="Settings"
       width="45%" />
  &emsp;&emsp;
  <img src="documentation/images/info.png"
       alt="Info"
       width="45%" />
</p>

## Build Environment

![Node](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/f-io/pi-carplay/version/.github/badges/main-node.json)
![npm](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/f-io/pi-carplay/version/.github/badges/main-npm.json)

---

### System Requirements (build)

Make sure the following packages and tools are installed on your system before building:

- **Python 3.x** (for native module builds via `node-gyp`)
- **build-essential** (Linux: includes `gcc`, `g++`, `make`, etc.)
- **libusb-1.0-0-dev** (required for `node-usb`)
- **libudev-dev** (optional but recommended for USB detection on Linux)
- **fuse** (required to run AppImages)

---

### Clone & Build

```bash
git clone --branch main --single-branch https://github.com/f-io/pi-carplay.git \
  && cd pi-carplay \
  && npm run install:clean \
  && npm run build \
  && npm run build:armLinux
```

---

### Linux (x86_64)

This AppImage has been tested on Debian Trixie (13). No additional software is required — just download the x86_64.AppImage and make it executable.

```bash
chmod +x pi-carplay-*-x86_64.AppImage
```

---

### Mac (arm64)

This step is required for all non-Apple-signed apps.

```bash
xattr -cr /Applications/pi-carplay.app
```

For microphone support, please install Sound eXchange (SoX) via brew.
```bash
brew install sox
```

---

## Links

* **Repository & Issue Tracker:** [f-io/pi-carplay](https://github.com/f-io/pi-carplay)
* **Inspired by:** [react-carplay](https://github.com/rhysmorgan134/react-carplay)

## Disclaimer

** _Apple and CarPlay are trademarks of Apple Inc. This project is not affiliated with or endorsed by Apple in any way. All trademarks are the property of their respective owners._


## License

This project is licensed under the MIT License.
