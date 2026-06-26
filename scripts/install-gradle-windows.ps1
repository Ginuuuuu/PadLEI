$ErrorActionPreference = "Stop"

$GradleVersion = "8.10.2"
$InstallRoot = "C:\Gradle"
$InstallDir = Join-Path $InstallRoot "gradle-$GradleVersion"
$GradleBin = Join-Path $InstallDir "bin"
$ZipPath = Join-Path $env:TEMP "gradle-$GradleVersion-bin.zip"
$DownloadUrl = "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip"

Write-Host "Installing Gradle $GradleVersion for PadLEI APK builds..."

if (Test-Path (Join-Path $GradleBin "gradle.bat")) {
  Write-Host "Gradle already exists at $GradleBin"
} else {
  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

  if (!(Test-Path $ZipPath)) {
    Write-Host "Downloading Gradle from $DownloadUrl"
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath
  }

  Write-Host "Extracting Gradle to $InstallRoot"
  Expand-Archive -Path $ZipPath -DestinationPath $InstallRoot -Force
}

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (!$UserPath) {
  $UserPath = ""
}

if ($UserPath -notlike "*$GradleBin*") {
  $NewPath = if ($UserPath.Trim()) { "$UserPath;$GradleBin" } else { $GradleBin }
  [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
  Write-Host "Added Gradle to your user PATH."
}

Write-Host ""
Write-Host "Done. Close this PowerShell window, open a new PowerShell window, then run:"
Write-Host "cd C:\Project\PadLEI"
Write-Host "gradle -v"
Write-Host "npm run apk:debug"
