# journal — install script for Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/YOUR_USERNAME/journal-app/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo = "Jack-McGinley/Terminal-Journal"
$BinName = "journal.exe"
$Asset = "journal-windows-x64.exe"
$InstallDir = "$env:LOCALAPPDATA\journal"
$LatestUrl = "https://github.com/$Repo/releases/latest/download/$Asset"

Write-Host "Downloading journal..." -ForegroundColor Cyan

# Create install directory
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

# Download binary
Invoke-WebRequest -Uri $LatestUrl -OutFile "$InstallDir\$BinName" -UseBasicParsing

# Add to PATH if not already there
$CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($CurrentPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$CurrentPath;$InstallDir", "User")
    Write-Host "Added $InstallDir to your PATH." -ForegroundColor Yellow
    Write-Host "Please restart your terminal for the PATH change to take effect." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✓ journal installed successfully!" -ForegroundColor Green
Write-Host "  Restart your terminal, then run 'journal' to get started." -ForegroundColor White
