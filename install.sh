#!/bin/sh
# journal — install script for macOS and Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/journal-app/main/install.sh | sh

set -e

REPO="YOUR_USERNAME/journal-app"
BIN_NAME="journal"
INSTALL_DIR="/usr/local/bin"

# Detect OS and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  ASSET="journal-macos-arm64" ;;
      x86_64) ASSET="journal-macos-x64" ;;
      *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64)  ASSET="journal-linux-x64" ;;
      aarch64) ASSET="journal-linux-arm64" ;;
      *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  *)
    echo "Unsupported OS: $OS"
    echo "For Windows, run: irm https://raw.githubusercontent.com/${REPO}/main/install.ps1 | iex"
    exit 1
    ;;
esac

# Get latest release URL from GitHub
LATEST_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

echo "Downloading journal..."
curl -fsSL "$LATEST_URL" -o "/tmp/${BIN_NAME}"
chmod +x "/tmp/${BIN_NAME}"

echo "Installing to ${INSTALL_DIR}/${BIN_NAME}..."
if [ -w "$INSTALL_DIR" ]; then
  mv "/tmp/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
else
  sudo mv "/tmp/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
fi

echo ""
echo "✓ journal installed successfully!"
echo "  Run 'journal' to get started."
