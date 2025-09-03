#!/usr/bin/env bash
set -euo pipefail

# ----------------------------------------
# round-carplay Installer & Shortcut Creator
# ----------------------------------------

# 0) Variables
USER_HOME="$HOME"
APPIMAGE_PATH="$USER_HOME/round-carplay/round-carplay.AppImage"
APPIMAGE_DIR="$(dirname "$APPIMAGE_PATH")"

echo "→ Creating target directory: $APPIMAGE_DIR"
mkdir -p "$APPIMAGE_DIR"

# Ensure required tools are installed
echo "→ Checking for required tools: curl, xdg-user-dir"
for tool in curl xdg-user-dir; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "   $tool not found, installing…"
    sudo apt-get update
    if [ "$tool" = "xdg-user-dir" ]; then
      sudo apt-get --yes install xdg-user-dirs
    else
      sudo apt-get --yes install "$tool"
    fi
  else
    echo "   $tool found"
  fi
done

# Create udev rule for Carlinkit dongle
echo "→ Writing udev rule"
UDEV_FILE="/etc/udev/rules.d/52-carplay.rules"
sudo tee "$UDEV_FILE" > /dev/null <<EOF
SUBSYSTEM=="usb", ATTR{idVendor}=="1314", ATTR{idProduct}=="152*", MODE="0660", GROUP="plugdev"
EOF
echo "   Reloading udev rules"
sudo udevadm control --reload-rules
sudo udevadm trigger

# ICON INSTALLATION
ICON_URL="https://raw.githubusercontent.com/OneMakerShow/round-carplay/custom-round/assets/icons/linux/pi-carplay.png"
ICON_DEST="$USER_HOME/.local/share/icons/round-carplay.png"

if [ -d "$USER_HOME/.local/share" ]; then
  echo "→ Installing icon to $ICON_DEST"
  mkdir -p "$(dirname "$ICON_DEST")"
  
  echo "   Downloading icon from $ICON_URL..."
  curl -L "$ICON_URL" -o "$ICON_DEST"
  
  if [ $? -eq 0 ]; then
    echo "   App icon downloaded and installed successfully."
  else
    echo "   Failed to download icon from $ICON_URL. Skipping icon install."
  fi
else
  echo "   No ~/.local/share directory, skipping icon installation."
fi

# Fetch latest ARM64 AppImage from your repo Release
echo "→ Fetching latest round-carplay release"
latest_url=$(curl -s https://api.github.com/repos/OneMakerShow/round-carplay/releases/latest \
  | grep "browser_download_url" \
  | grep "arm64.AppImage" \
  | cut -d '"' -f 4)

if [ -z "$latest_url" ]; then
  echo "Error: Could not find ARM64 AppImage URL in your repo releases" >&2
  exit 1
fi

echo "   Download URL: $latest_url"
if ! curl -L "$latest_url" --output "$APPIMAGE_PATH"; then
  echo "Error: Download failed" >&2
  exit 1
fi
echo "   Download complete: $APPIMAGE_PATH"

# Mark AppImage as executable
echo "→ Setting executable flag"
chmod +x "$APPIMAGE_PATH"

# Create per-user autostart entry
echo "→ Creating autostart entry"
AUTOSTART_DIR="$USER_HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_DIR/round-carplay.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=round-carplay
Exec=$APPIMAGE_PATH
Icon=round-carplay
X-GNOME-Autostart-enabled=true
Categories=AudioVideo;
EOF
echo "Autostart entry at $AUTOSTART_DIR/round-carplay.desktop"

# Create Desktop shortcut
echo "→ Creating desktop shortcut"
if command -v xdg-user-dir >/dev/null 2>&1; then
  DESKTOP_DIR=$(xdg-user-dir DESKTOP)
else
  DESKTOP_DIR="$USER_HOME/Desktop"
fi

mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/round-carplay.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=round-carplay
Comment=Launch round-carplay AppImage
Exec=$APPIMAGE_PATH
Icon=round-carplay
Terminal=false
Categories=Utility;
StartupNotify=false
EOF
chmod +x "$DESKTOP_DIR/round-carplay.desktop"
echo "Desktop shortcut at $DESKTOP_DIR/round-carplay.desktop"

echo "✅ Installation complete!"
