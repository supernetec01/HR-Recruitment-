param(
    [switch]$InstallStartup,
    [string]$JielienDirectory = 'D:\SuperNet\Jielien',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')][string]$ContainerName = 'jielien-local-app-1',
    [string]$DockerDesktopPath = ''
)

# HR runs in its existing task; Jielien runs in its existing Docker container.
# Never run maintenance, rebuild an image, recreate a container, or change volumes.
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Run this script on the Windows website host.' }
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logDirectory = Join-Path $repo '.data\diagnostics\websites-startup'
$null = New-Item -ItemType Directory -Path $logDirectory -Force
$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$script:StartupLogFile = Join-Path $logDirectory ($stamp + '.log')
$script:StartupScriptPath = $PSCommandPath
$script:DockerExecutable = $null
$startupLock = $null

function Write-StartupLog {
    param([string]$Message)
    $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $Message
    Add-Content -LiteralPath $script:StartupLogFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Stop-WebsitesStartup {
    param([string]$Reason)
    $startupException = New-Object InvalidOperationException $Reason
    $startupException.Data['WebsitesStartupReason'] = $Reason
    throw $startupException
}

function Resolve-DesktopCandidate {
    param([string]$Value, [switch]$Explicit)
    if (-not $Value -or $Value -match '[\r\n]') { return }
    $value = [Environment]::ExpandEnvironmentVariables($Value.Trim())
    # DisplayIcon can be quoted and have an icon index; never execute its arguments.
    $match = [regex]::Match($value, '^(?:"([^"\r\n]+\.exe)"|([^"\r\n]+?\.exe))(?:,\s*-?\d+)?$', 'IgnoreCase')
    if (-not $match.Success) { return }
    $path = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
    if (-not [IO.Path]::IsPathRooted($path)) { return }
    if (-not $Explicit -and [IO.Path]::GetFileName($path) -notin @('Docker Desktop.exe', 'DockerDesktop.exe')) { return }
    if (Test-Path -LiteralPath $path -PathType Leaf) { return [IO.Path]::GetFullPath($path) }
}

function Get-DockerDesktopRegistryPaths {
    # Read only Docker application metadata, never Run values or uninstall commands.
    foreach ($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion', 'HKLM:\Software\Microsoft\Windows\CurrentVersion', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion')) {
        foreach ($name in @('Docker Desktop.exe', 'DockerDesktop.exe')) {
            try {
                $key = Get-Item -LiteralPath ($root + '\App Paths\' + $name) -ErrorAction SilentlyContinue
                if ($null -ne $key) { $key.GetValue('') }
            } catch { }
        }
        foreach ($key in @(Get-ChildItem -LiteralPath ($root + '\Uninstall') -ErrorAction SilentlyContinue)) {
            try {
                if ([string]$key.GetValue('DisplayName') -notmatch '^Docker\s*Desktop(?:\s+\d.*)?$') { continue }
                $key.GetValue('DisplayIcon')
                $directory = [string]$key.GetValue('InstallLocation')
                if ($directory) {
                    $directory = [Environment]::ExpandEnvironmentVariables($directory.Trim().Trim('"'))
                    foreach ($name in @('Docker Desktop.exe', 'DockerDesktop.exe')) { Join-Path $directory $name }
                }
            } catch { }
        }
    }
}

function Get-DockerDesktopShortcutPaths {
    $shell = $null
    try {
        foreach ($folderName in @('Programs', 'CommonPrograms', 'DesktopDirectory', 'CommonDesktopDirectory')) {
            $folder = [Environment]::GetFolderPath($folderName)
            if (-not $folder) { continue }
            foreach ($relative in @('Docker Desktop.lnk', 'DockerDesktop.lnk', 'Docker\Docker Desktop.lnk', 'Docker Desktop\Docker Desktop.lnk')) {
                $shortcutPath = Join-Path $folder $relative
                if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { continue }
                if ($null -eq $shell) { $shell = New-Object -ComObject WScript.Shell }
                $shortcut = $shell.CreateShortcut($shortcutPath)
                try { $shortcut.TargetPath } finally { $null = [Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut) }
            }
        }
    } finally { if ($null -ne $shell) { $null = [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) } }
}

function Get-DockerDesktopInstallDirectories {
    param([string]$DockerCliPath, [string[]]$ProgramRoots, [string]$LocalAppDataDirectory)
    $directories = New-Object 'System.Collections.Generic.List[string]'
    if ($DockerCliPath) {
        # Docker CLI commonly lives at <installation>\resources\bin\docker.exe.
        $bin = Split-Path -Parent $DockerCliPath
        if ((Split-Path -Leaf $bin) -eq 'bin') {
            $resources = Split-Path -Parent $bin
            if ((Split-Path -Leaf $resources) -eq 'resources') { $directories.Add((Split-Path -Parent $resources)) }
        }
    }
    foreach ($programRoot in $ProgramRoots) {
        if ($programRoot) { $directories.Add((Join-Path $programRoot 'Docker\Docker')) }
    }
    if ($LocalAppDataDirectory) {
        foreach ($relative in @('Programs\DockerDesktop', 'Programs\Docker\Docker', 'Docker')) { $directories.Add((Join-Path $LocalAppDataDirectory $relative)) }
    }
    $directories.ToArray()
}

function Find-DockerDesktop {
    param([string]$RequestedPath, [string]$DockerCliPath)
    if ($RequestedPath) {
        $resolved = Resolve-DesktopCandidate -Value $RequestedPath -Explicit
        if (-not $resolved) { Stop-WebsitesStartup 'The supplied DockerDesktopPath is not an existing executable. Check its actual path.' }
        return $resolved
    }
    foreach ($process in @(Get-Process -Name 'Docker Desktop', 'DockerDesktop' -ErrorAction SilentlyContinue)) {
        try { $resolved = Resolve-DesktopCandidate -Value $process.Path; if ($resolved) { return $resolved } } catch { }
    }
    $directories = @(Get-DockerDesktopInstallDirectories -DockerCliPath $DockerCliPath -ProgramRoots @($env:ProgramFiles, $env:ProgramW6432) -LocalAppDataDirectory $env:LOCALAPPDATA)
    foreach ($directory in $directories) {
        foreach ($name in @('Docker Desktop.exe', 'DockerDesktop.exe')) {
            $resolved = Resolve-DesktopCandidate -Value (Join-Path $directory $name)
            if ($resolved) { return $resolved }
        }
    }
    try { $registryPaths = @(Get-DockerDesktopRegistryPaths) } catch { $registryPaths = @() }
    foreach ($value in $registryPaths) {
        $resolved = Resolve-DesktopCandidate -Value ([string]$value)
        if ($resolved) { return $resolved }
    }
    try { $shortcutPaths = @(Get-DockerDesktopShortcutPaths) } catch { $shortcutPaths = @() }
    foreach ($value in $shortcutPaths) {
        $resolved = Resolve-DesktopCandidate -Value ([string]$value)
        if ($resolved) { return $resolved }
    }
}

function Invoke-DockerCommand {
    param([string[]]$CommandArgs, [int]$TimeoutSeconds = 15)
    # Arguments are fixed Docker commands and a validated container name, all without spaces.
    $cli = New-Object System.Diagnostics.Process
    $cli.StartInfo.FileName = $script:DockerExecutable
    $cli.StartInfo.Arguments = $CommandArgs -join ' '
    $cli.StartInfo.UseShellExecute = $false
    $cli.StartInfo.CreateNoWindow = $true
    $cli.StartInfo.RedirectStandardOutput = $true
    $cli.StartInfo.RedirectStandardError = $true
    try {
        $null = $cli.Start()
        $stdout = $cli.StandardOutput.ReadToEndAsync()
        $stderr = $cli.StandardError.ReadToEndAsync()
        if (-not $cli.WaitForExit($TimeoutSeconds * 1000)) {
            # Only terminate this script's own timed-out CLI, never a container or another process.
            $cli.Kill()
            $cli.WaitForExit()
            return [pscustomobject]@{ ExitCode = -1; Output = '' }
        }
        $output = $stdout.GetAwaiter().GetResult()
        $null = $stderr.GetAwaiter().GetResult()
        return [pscustomobject]@{ ExitCode = $cli.ExitCode; Output = $output.Trim() }
    } finally { $cli.Dispose() }
}

function Start-ExistingTask {
    param([string]$Name)
    $task = Get-ScheduledTask -TaskName $Name -TaskPath '\'
    if ([string]$task.State -eq 'Disabled') { Stop-WebsitesStartup ('Task is disabled: ' + $Name) }
    if ([string]$task.State -ne 'Running') { Start-ScheduledTask -TaskName $Name -TaskPath '\' }
    Write-StartupLog ('Requested existing task: ' + $Name)
}

function Wait-DockerEngine {
    param([string]$DesktopPath)
    $engine = Invoke-DockerCommand -CommandArgs @('info', '--format', '{{.OSType}}')
    if ($engine.ExitCode -eq 0) { return }
    if (@(Get-Process -Name 'Docker Desktop', 'DockerDesktop' -ErrorAction SilentlyContinue).Count -eq 0) {
        if (-not $DesktopPath -or -not (Test-Path -LiteralPath $DesktopPath -PathType Leaf)) {
            Stop-WebsitesStartup 'Docker engine is unavailable. Open Docker Desktop in this Windows account, then run the script again.'
        }
        $null = Start-Process -FilePath $DesktopPath -WindowStyle Minimized -PassThru
        Write-StartupLog 'Started Docker Desktop; waiting for its engine.'
    }
    $deadline = (Get-Date).AddSeconds(240)
    do {
        Start-Sleep -Seconds 5
        $engine = Invoke-DockerCommand -CommandArgs @('info', '--format', '{{.OSType}}')
        if ($engine.ExitCode -eq 0) { Write-StartupLog 'Docker engine is ready.'; return }
        Write-StartupLog 'Waiting for Docker engine...'
    } while ((Get-Date) -lt $deadline)
    Stop-WebsitesStartup 'Docker engine did not become ready. Check Docker Desktop/WSL in this Windows account; the startup task will retry.'
}

function Start-JielienContainer {
    param([string]$Name, [string]$DesktopPath)
    Wait-DockerEngine -DesktopPath $DesktopPath
    $state = Invoke-DockerCommand -CommandArgs @('inspect', '--format', '{{.State.Running}}', $Name)
    if ($state.ExitCode -ne 0 -or $state.Output -notin @('true', 'false')) {
        Stop-WebsitesStartup 'The existing Jielien container was not found in this Docker context. No container was created; check the account/context.'
    }
    $policy = Invoke-DockerCommand -CommandArgs @('inspect', '--format', '{{.HostConfig.RestartPolicy.Name}}', $Name)
    $retries = Invoke-DockerCommand -CommandArgs @('inspect', '--format', '{{.HostConfig.RestartPolicy.MaximumRetryCount}}', $Name)
    if ($policy.ExitCode -ne 0 -or $retries.ExitCode -ne 0 -or $policy.Output -notin @('no', 'always', 'unless-stopped', 'on-failure') -or $retries.Output -notmatch '^\d+$') {
        Stop-WebsitesStartup 'Could not safely read the existing container restart policy.'
    }
    Write-StartupLog ('Container restart policy before this run: ' + $policy.Output + '; maximum retries: ' + $retries.Output)
    if ($policy.Output -ne 'unless-stopped') {
        $updated = Invoke-DockerCommand -CommandArgs @('update', '--restart', 'unless-stopped', $Name)
        if ($updated.ExitCode -ne 0) { Stop-WebsitesStartup 'Could not enable the Jielien container restart policy.' }
    }
    if ($state.Output -eq 'false') {
        $started = Invoke-DockerCommand -CommandArgs @('start', $Name) -TimeoutSeconds 30
        if ($started.ExitCode -ne 0) { Stop-WebsitesStartup 'Could not start the existing Jielien container. Check Docker Desktop; no container was recreated.' }
    }
    $ports = Invoke-DockerCommand -CommandArgs @('port', $Name)
    if ($ports.ExitCode -ne 0 -or $ports.Output -notmatch '(?m):3001\s*$') {
        Stop-WebsitesStartup 'The existing container does not publish host port 3001. Check its existing Compose configuration; no port or volume was changed.'
    }
    Write-StartupLog 'Existing Jielien container started/retained; host port 3001 is published.'
}

function Test-WebsiteOrigins {
    $hrReady = $false; $jielienReady = $false
    try {
        $hr = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/v1/health' -TimeoutSec 3 -MaximumRedirection 0
        $hrReady = ($hr.status -eq 'ok' -and $hr.demo -eq $false)
    } catch { }
    try {
        $jielien = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3001/' -TimeoutSec 3 -MaximumRedirection 0
        $jielienReady = ([int]$jielien.StatusCode -eq 200)
    } catch { }
    return [pscustomobject]@{ HR = $hrReady; Jielien = $jielienReady }
}

function Install-WebsitesStartup {
    param([string]$ProjectDirectory, [string]$Name, [string]$DesktopPath)
    $hrTask = Get-ScheduledTask -TaskName 'HR-Website' -TaskPath '\'
    if ([string]$hrTask.Principal.LogonType -notin @('Interactive', 'InteractiveToken') -or -not $hrTask.Principal.UserId) {
        Stop-WebsitesStartup 'The existing HR task must use the expected logged-on Windows account.'
    }
    $existing = @(Get-ScheduledTask -TaskName 'SuperNet-Websites' -TaskPath '\' -ErrorAction SilentlyContinue)
    if ($existing.Count -gt 0) {
        if ($existing.Count -ne 1 -or @($existing[0].Actions).Count -ne 1 -or
            $existing[0].Actions.Execute -notmatch '(?i)(^|[\\/])powershell\.exe$' -or
            $existing[0].Actions.Arguments -match '(?i)(?:^|\s)-(Command|c|EncodedCommand|enc)(?:\s|$)' -or
            $existing[0].Actions.Arguments -notmatch ('(?i)(?:^|\s)-File\s+"' + [regex]::Escape($script:StartupScriptPath) + '"(?=\s|$)') -or
            $existing[0].Principal.UserId -ne $hrTask.Principal.UserId -or
            [string]$existing[0].Principal.LogonType -notin @('Interactive', 'InteractiveToken')) {
            Stop-WebsitesStartup 'An unrelated task already uses the name SuperNet-Websites. It was not overwritten.'
        }
        $backup = Join-Path $logDirectory ($stamp + '-task-before.xml')
        Export-ScheduledTask -TaskName 'SuperNet-Websites' -TaskPath '\' | Set-Content -LiteralPath $backup -Encoding UTF8
        if (-not (Test-Path -LiteralPath $backup -PathType Leaf) -or (Get-Item -LiteralPath $backup).Length -eq 0) {
            Stop-WebsitesStartup 'The existing startup task could not be backed up. It was not changed.'
        }
    }
    $arguments = '-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -WindowStyle Hidden -File "' + $script:StartupScriptPath + '" -JielienDirectory "' + $ProjectDirectory + '" -ContainerName ' + $Name
    if ($DesktopPath) { $arguments += ' -DockerDesktopPath "' + $DesktopPath + '"' }
    $action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument $arguments -WorkingDirectory $repo
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $hrTask.Principal.UserId
    $trigger.Delay = 'PT30S'
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
    if ($existing.Count -eq 0) {
        $null = Register-ScheduledTask -TaskName 'SuperNet-Websites' -TaskPath '\' -Action $action -Trigger $trigger -Settings $settings -Principal $hrTask.Principal
    } else {
        $null = Set-ScheduledTask -TaskName 'SuperNet-Websites' -TaskPath '\' -Action $action -Trigger $trigger -Settings $settings
    }
    Write-StartupLog ('Installed SuperNet-Websites: 30 seconds after logon by ' + $hrTask.Principal.UserId + '. Startup failures retry after 1 minute.')
}

try {
    foreach ($pathValue in @($JielienDirectory, $DockerDesktopPath, $PSCommandPath)) {
        if ($pathValue -match '["\r\n]') { Stop-WebsitesStartup 'Startup paths cannot contain quotes or newlines.' }
    }
    $JielienDirectory = [IO.Path]::GetFullPath($JielienDirectory).TrimEnd('\')
    if (-not (Test-Path -LiteralPath $JielienDirectory -PathType Container)) { Stop-WebsitesStartup 'The existing Jielien project directory is missing.' }
    try { $script:DockerExecutable = (Get-Command docker.exe -ErrorAction Stop).Source } catch { }
    $DockerDesktopPath = Find-DockerDesktop -RequestedPath $DockerDesktopPath -DockerCliPath $script:DockerExecutable
    if (-not $script:DockerExecutable -and $DockerDesktopPath) {
        $script:DockerExecutable = Join-Path (Split-Path -Parent $DockerDesktopPath) 'resources\bin\docker.exe'
    }
    if (-not $script:DockerExecutable) { $script:DockerExecutable = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe' }
    if (-not (Test-Path -LiteralPath $script:DockerExecutable -PathType Leaf)) { Stop-WebsitesStartup 'Docker CLI was not found. Check the existing Docker Desktop installation.' }
    if ($InstallStartup -and -not $DockerDesktopPath) {
        Stop-WebsitesStartup 'Could not locate Docker Desktop. Open Docker Desktop manually, then run this command again; or supply -DockerDesktopPath with its actual .exe path.'
    }
    if ($DockerDesktopPath) { Write-StartupLog ('Docker Desktop executable: ' + $DockerDesktopPath) }
    # Resolve the task before creating any startup configuration.
    $null = Get-ScheduledTask -TaskName 'Jielien-Cloudflare-Tunnel' -TaskPath '\'
    if ($InstallStartup) { Install-WebsitesStartup -ProjectDirectory $JielienDirectory -Name $ContainerName -DesktopPath $DockerDesktopPath }
    try {
        $startupLock = [IO.File]::Open((Join-Path $logDirectory 'startup.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch [IO.IOException] {
        if (($_.Exception.HResult -band 65535) -in @(32, 33)) { Write-StartupLog 'Another startup is already in progress; no duplicate startup was launched.'; exit 0 }
        throw
    }
    Start-ExistingTask -Name 'HR-Website'
    Start-ExistingTask -Name 'Jielien-Cloudflare-Tunnel'
    Start-JielienContainer -Name $ContainerName -DesktopPath $DockerDesktopPath
    foreach ($attempt in 1..20) {
        $origins = Test-WebsiteOrigins
        if ($origins.HR -and $origins.Jielien) {
            Write-StartupLog 'PASS: HR port 3000 is healthy and Jielien port 3001 returned HTTP 200.'
            Write-StartupLog 'Verify tunnel routes: hr.jielien.com.vn -> http://127.0.0.1:3000; jielien.com.vn -> http://127.0.0.1:3001.'
            exit 0
        }
        Write-StartupLog ('Waiting for origins (' + $attempt + '/20): HR=' + $origins.HR + '; Jielien=' + $origins.Jielien)
        Start-Sleep -Seconds 2
    }
    Stop-WebsitesStartup 'Both origins are not ready yet. Inspect HR logs and the existing Jielien container in Docker Desktop; the startup task will retry.'
} catch {
    $reason = $_.Exception.Data['WebsitesStartupReason']
    if (-not $reason) { $reason = 'Startup could not finish (' + $_.Exception.GetType().Name + '). Check Task Scheduler permissions, Docker Desktop, and this log.' }
    Write-StartupLog ('FAILED: ' + $reason)
    Write-Host ('Log: ' + $script:StartupLogFile)
    exit 1
} finally { if ($null -ne $startupLock) { $startupLock.Dispose() } }
