param(
    [string]$TaskName = 'HR-Website',
    [string]$TaskPath = '\',
    [ValidateRange(1, 65535)][int]$Port = 3000,
    [string]$BackupDirectory = '',
    [switch]$SkipStart
)

# Repair only the existing website task. Preserve its user, startup script,
# arguments, working directory, application data and the separate tunnel task.
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Run this repair on the Windows computer hosting the website.' }
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$step = 'Inspect existing task'
$backupPath = $null

function Stop-StartupRepair {
    param([string]$Reason)
    $repairException = New-Object InvalidOperationException $Reason
    $repairException.Data['StartupRepairReason'] = $Reason
    throw $repairException
}

function Test-OriginHealth {
    param([int]$OriginPort)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:' + $OriginPort + '/api/v1/health') -TimeoutSec 2 -MaximumRedirection 0
        $health = $response.Content | ConvertFrom-Json
        return ([int]$response.StatusCode -eq 200 -and $health.status -eq 'ok' -and $health.demo -eq $false)
    } catch { return $false }
}

try {
    $tasks = @(Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath)
    if ($tasks.Count -ne 1) { Stop-StartupRepair 'Expected exactly one existing website task.' }
    $task = $tasks[0]
    $actions = @($task.Actions)
    $execute = if ($actions.Count -eq 1) { ([string]$actions[0].Execute).Trim().Trim('"') } else { '' }
    if ($actions.Count -ne 1 -or $execute -notmatch '(?i)(^|[\\/])powershell\.exe$') { Stop-StartupRepair 'This repair requires the existing single PowerShell startup action.' }
    if ([string]$task.Principal.LogonType -notin @('Interactive', 'InteractiveToken') -or -not $task.Principal.UserId) { Stop-StartupRepair 'Task account is not the expected interactive user; inspect its configuration first.' }
    $arguments = [string]$actions[0].Arguments
    if ($arguments -match '(?i)(?:^|\s)-(Command|c|EncodedCommand|enc)(?:\s|$)') { Stop-StartupRepair 'Inline or encoded startup commands require separate inspection.' }
    $match = [regex]::Match($arguments, '(?i)(?:^|\s)-File\s+(?:"([^"]+\.ps1)"|''([^'']+\.ps1)''|([^\s]+\.ps1))(?=\s|$)')
    if (-not $match.Success) { Stop-StartupRepair 'The task does not reference an existing startup script.' }
    $scriptPath = $null
    foreach ($index in 1..3) { if ($match.Groups[$index].Success) { $scriptPath = $match.Groups[$index].Value; break } }
    if (-not [IO.Path]::IsPathRooted($scriptPath)) {
        if (-not $actions[0].WorkingDirectory) { Stop-StartupRepair 'A relative startup script needs a known working directory.' }
        $scriptPath = Join-Path $actions[0].WorkingDirectory $scriptPath
    }
    $expectedScript = [IO.Path]::GetFullPath((Join-Path $repo 'start-hr.ps1'))
    if (-not [StringComparer]::OrdinalIgnoreCase.Equals([IO.Path]::GetFullPath($scriptPath), $expectedScript) -or -not (Test-Path -LiteralPath $expectedScript -PathType Leaf)) { Stop-StartupRepair 'The task must reference start-hr.ps1 in this checkout. No changes were made.' }
    if (-not (Test-Path -LiteralPath (Join-Path $repo 'server\index.mjs') -PathType Leaf)) { Stop-StartupRepair 'Application entry point is missing from this checkout.' }
    foreach ($existingTrigger in @($task.Triggers)) {
        if ($existingTrigger.CimClass.CimClassName -notin @('MSFT_TaskBootTrigger', 'MSFT_TaskLogonTrigger')) { Stop-StartupRepair 'This task has other trigger types; inspect them before changing startup behavior.' }
    }

    $step = 'Back up task definition'
    if (-not $BackupDirectory) { $BackupDirectory = Join-Path $repo '.data\diagnostics\task-backups' }
    if (-not (Test-Path -LiteralPath $BackupDirectory)) { $null = New-Item -ItemType Directory -Path $BackupDirectory -Force }
    $safeName = $TaskName -replace '[^A-Za-z0-9_.-]', '_'
    $backupPath = Join-Path $BackupDirectory ($safeName + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.xml')
    Export-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath | Set-Content -LiteralPath $backupPath -Encoding UTF8
    if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf) -or (Get-Item -LiteralPath $backupPath).Length -eq 0) { Stop-StartupRepair 'Task backup could not be verified. No changes were made.' }

    $step = 'Update website task settings'
    $settings = $task.Settings
    $settings.ExecutionTimeLimit = 'PT0S'
    $settings.RestartCount = 999
    $settings.RestartInterval = 'PT1M'
    $settings.StartWhenAvailable = $true
    $settings.DisallowStartIfOnBatteries = $false
    $settings.StopIfGoingOnBatteries = $false
    $settings.MultipleInstances = 2 # TASK_INSTANCES_IGNORE_NEW; never launch duplicate instances.
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $task.Principal.UserId
    $trigger.Delay = 'PT30S'
    # Add Hidden before -File so it is a PowerShell option, not a script argument.
    $prefix = $arguments.Substring(0, $match.Index) -replace '(?i)(?:^|\s)-WindowStyle\s+(Hidden|Normal|Minimized|Maximized)(?=\s|$)', ''
    $newArguments = ($prefix.Trim() + ' -WindowStyle Hidden ' + $arguments.Substring($match.Index).TrimStart()).Trim()
    $action = New-ScheduledTaskAction -Execute $execute -Argument $newArguments -WorkingDirectory $actions[0].WorkingDirectory
    $null = Set-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Settings $settings -Trigger $trigger -Action $action
    Write-Host ('Updated only task: ' + $TaskPath + $TaskName)
    Write-Host ('Original task backup: ' + $backupPath)
    Write-Host 'Startup script, data directory, task account, and tunnel task were preserved.'
    Write-Host 'Website will start 30 seconds after this account logs on. Unexpected exits retry after 1 minute.'

    if ($SkipStart) { Write-Host 'Immediate start skipped. Run the diagnostic after the next logon.'; exit 0 }
    $step = 'Start task and check local health'
    if (Test-OriginHealth -OriginPort $Port) { Write-Host 'Website is already healthy; no additional process was started.'; exit 0 }
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq $Port })
    if ($listeners.Count -gt 0) { Stop-StartupRepair 'The origin port is occupied but is not a healthy internal website. No process was stopped.' }
    $current = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath
    if ([string]$current.State -ne 'Running') { Start-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath }
    foreach ($attempt in 1..15) {
        Write-Host ('Waiting for website readiness: ' + $attempt + '/15')
        Start-Sleep -Seconds 2
        if (Test-OriginHealth -OriginPort $Port) { Write-Host 'PASS: local website health returned HTTP 200 and status=ok.'; exit 0 }
    }
    $info = Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath $TaskPath
    Write-Host ('Website is not ready. Task result: 0x{0:X8}' -f ([long]$info.LastTaskResult -band 4294967295))
    Write-Host 'Inspect the latest logs\hr-*.err.log or hr-*.launch-error.log in this checkout. No log contents were printed.'
    Write-Host 'Run scripts\diagnose-windows-startup.ps1 again to collect the updated state.'
    exit 2
} catch {
    Write-Host ('Repair did not finish at step: ' + $step)
    Write-Host ('Error category: ' + $_.Exception.GetType().Name)
    if ($_.Exception.Data['StartupRepairReason']) { Write-Host ('Reason: ' + $_.Exception.Data['StartupRepairReason']) }
    if ($backupPath) { Write-Host ('Task backup, if created: ' + $backupPath) }
    Write-Host 'Check that this is the HR checkout and that PowerShell has permission to read/update the existing task. Raw task arguments were not printed.'
    exit 1
}
