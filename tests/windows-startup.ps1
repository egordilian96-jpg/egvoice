$ErrorActionPreference = "Stop"
$version = (Get-Content package.json | ConvertFrom-Json).version
$bundle = Join-Path $PWD "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis"
$installer = Join-Path $bundle "EG Voice_${version}_x64-setup.exe"
$installDir = Join-Path $env:RUNNER_TEMP "egvoice-installed"
$diagnostics = Join-Path $PWD "windows-diagnostics"
$log = Join-Path $env:LOCALAPPDATA "EG Voice/logs/startup.log"
New-Item -ItemType Directory -Force $diagnostics | Out-Null
$app = $null
try {
    # Exercise the real installer, not just the build-directory executable.
    $setup = Start-Process $installer -ArgumentList @("/S", "/D=$installDir") -PassThru -Wait
    if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
    $exe = Join-Path $installDir "eg-voice.exe"
    if (-not (Test-Path $exe)) { throw "Installed executable not found: $exe" }
    if (Test-Path $log) { Remove-Item $log }
    $app = Start-Process $exe -PassThru
    $ready = $false
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 1
        $app.Refresh()
        if ($app.HasExited) { throw "Application exited during startup: $($app.ExitCode)" }
        $nativeWindow = $app.MainWindowHandle -ne 0 -and $app.MainWindowTitle -eq "EG Voice"
        $reactReady = (Test-Path $log) -and ((Get-Content $log -Raw) -match "frontend-ready")
        if ($nativeWindow -and $reactReady) { $ready = $true; break }
    }
    if (-not $ready) { throw "No EG Voice main window and mounted React confirmation within 45 seconds" }
    Start-Sleep -Seconds 10
    $app.Refresh()
    if ($app.HasExited -or $app.MainWindowHandle -eq 0) { throw "Application did not remain running" }
    @{
        version = $version
        installed_executable = "eg-voice.exe"
        native_window = $true
        react_mounted = $true
        remained_running_seconds = 10
        runner_os = [System.Environment]::OSVersion.VersionString
        voice_tested = $false
    } | ConvertTo-Json | Set-Content (Join-Path $diagnostics "startup-result.json")
    Write-Host "PASS: installed app opened its main window, mounted React and remained running."
} finally {
    if (Test-Path $log) { Copy-Item $log $diagnostics -Force }
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force }
}
