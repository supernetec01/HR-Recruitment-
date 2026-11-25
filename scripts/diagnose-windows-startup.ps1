param(
    [string]$TaskName = '',
    [ValidateRange(1, 65535)][int]$Port = 3000,
    [string]$PublicHostname = 'hr.jielien.com.vn',
    [string]$ReportPath = ''
)

# Read-only diagnostics. Never print raw task arguments, command lines, environment,
# credentials, tunnel tokens, config files, or recruitment database contents.
$ErrorActionPreference = 'Stop'

function Get-SafeLaunchInfo {
    param([string]$Arguments)
    $scriptFile = $null
    $inline = [bool]($Arguments -match '(?i)(?:^|\s)-(Command|c)(?:\s|$)')
    $encoded = [bool]($Arguments -match '(?i)(?:^|\s)-(EncodedCommand|enc)(?:\s|$)')
    $match = [regex]::Match($Arguments, '(?i)(?:^|\s)-File\s+(?:"([^"]+\.ps1)"|''([^'']+\.ps1)''|([^\s]+\.ps1))(?=\s|$)')
    if ($match.Success -and -not $inline -and -not $encoded) {
        foreach ($index in 1..3) { if ($match.Groups[$index].Success) { $scriptFile = $match.Groups[$index].Value; break } }
    }
    [pscustomobject]@{
        ScriptFile = $scriptFile
        ScriptFileExists = if ($scriptFile) { Test-Path -LiteralPath $scriptFile -PathType Leaf } else { $null }
        UsesInlineCommand = $inline
        UsesEncodedCommand = $encoded
        UsesNoExit = [bool]($Arguments -match '(?i)(?:^|\s)-NoExit(?:\s|$)')
        MentionsNpmStart = [bool]($Arguments -match '(?i)npm(?:\.cmd)?\s+(?:run\s+)?start\b')
        MentionsServerEntry = [bool]($Arguments -match '(?i)server[\\/]index\.mjs')
        RawArgumentsOmitted = $true
    }
}

function Get-SafeProgram {
    param([string]$Value)
    $value = $Value.Trim()
    $match = [regex]::Match($value, '(?i)^"([^"]+\.(?:exe|cmd|bat|ps1))"(?:\s|$)|^(.+?\.(?:exe|cmd|bat|ps1))(?=\s|$)')
    if ($match.Success) {
        if ($match.Groups[1].Success) { return $match.Groups[1].Value }
        return $match.Groups[2].Value
    }
    if ($value -match '^[A-Za-z0-9_.\\/:-]+$') { return $value }
    return '[Unrecognized Program value omitted; inspect locally.]'
}

function Get-TaskResultMeaning {
    param([long]$Code)
    switch ($Code -band 4294967295) {
        0 { 'Last action exited successfully; this does not prove the website is running.' }
        1 { 'Action failed; inspect its own startup log.' }
        267009 { 'Task is running; this does not prove the website is ready.' }
        267011 { 'Task has not run yet.' }
        2147942402 { 'A referenced executable or file was not found.' }
        2147942667 { 'The working directory is invalid.' }
        2147943726 { 'Task account credentials were rejected.' }
        default { 'Check this code and task history in Task Scheduler.' }
    }
}

if ($env:OS -ne 'Windows_NT') { throw 'Run this diagnostic on the Windows computer hosting the website.' }
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Write-Host 'Collecting startup diagnostics. No startup settings will be changed.'
$notes = New-Object 'System.Collections.Generic.List[string]'
$failures = New-Object 'System.Collections.Generic.List[string]'
$report = [ordered]@{
    GeneratedAt = (Get-Date).ToString('o')
    PowerShellVersion = $PSVersionTable.PSVersion.ToString()
    RepoPath = $repo
    CurrentDirectory = (Get-Location).Path
    PackageJsonPresent = Test-Path -LiteralPath (Join-Path $repo 'package.json')
    DependenciesPresent = Test-Path -LiteralPath (Join-Path $repo 'node_modules')
    BuiltFrontendPresent = Test-Path -LiteralPath (Join-Path $repo 'dist\index.html')
    DefaultDataDirectoryPresent = Test-Path -LiteralPath (Join-Path $repo '.data\internal')
    NodeOnCurrentUserPath = $null
    BootTime = $null
    Processes = @()
    Port = $Port
    Listeners = @()
    LocalHealth = $null
    TaskSelection = 'Non-Microsoft tasks mentioning node/npm/PowerShell/cmd/cloudflared/recruitment, or the requested TaskName.'
    Tasks = @()
    Services = @()
    ExecutionPolicies = @()
    DNS = @()
}

try { $report.NodeOnCurrentUserPath = (Get-Command node.exe -ErrorAction Stop).Source } catch { $notes.Add('node.exe is not on the current user PATH; the task account may have a different PATH.') }
try { $report.BootTime = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString('o') } catch { $failures.Add('BootTime: ' + $_.Exception.GetType().Name) }
Write-Host 'Checking processes, origin port, and local health...'
try {
    $report.Processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|cloudflared|powershell|pwsh|cmd)\.exe$' } | ForEach-Object {
        [pscustomobject]@{ Name = $_.Name; PID = $_.ProcessId; ParentPID = $_.ParentProcessId; ExecutablePath = $_.ExecutablePath; Launch = Get-SafeLaunchInfo -Arguments ([string]$_.CommandLine) }
    })
} catch { $failures.Add('Processes: ' + $_.Exception.GetType().Name) }
try {
    $report.Listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq $Port } | Select-Object LocalAddress, LocalPort, OwningProcess)
    if ($report.Listeners.Count -eq 0) { $notes.Add('No listener was found on the configured origin port. Inspect the website task before changing the tunnel.') }
} catch { $failures.Add('Listeners: ' + $_.Exception.GetType().Name) }
try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:' + $Port + '/api/v1/health') -TimeoutSec 5 -MaximumRedirection 0
    $health = $response.Content | ConvertFrom-Json
    $report.LocalHealth = [pscustomobject]@{ HTTP = [int]$response.StatusCode; Status = [string]$health.status; Demo = $health.demo }
} catch { $report.LocalHealth = [pscustomobject]@{ HTTP = $null; Status = 'Failed'; ErrorType = $_.Exception.GetType().Name } }

Write-Host 'Reading selected Task Scheduler entries...'
try {
    $tasks = @(Get-ScheduledTask | Where-Object {
        if ($TaskName) { $_.TaskName -like $TaskName }
        else { $_.TaskPath -notlike '\Microsoft\*' -and (($_.TaskName + ' ' + ($_.Actions.Execute -join ' ') + ' ' + ($_.Actions.Arguments -join ' ')) -match '(?i)cloudflared|supernet|recruitment|jielien|node|npm|powershell|pwsh|cmd') }
    })
    $report.Tasks = @($tasks | ForEach-Object {
        $task = $_; $info = $null
        try { $info = Get-ScheduledTaskInfo -TaskName $task.TaskName -TaskPath $task.TaskPath } catch { $failures.Add('TaskInfo unavailable for a selected task: ' + $_.Exception.GetType().Name) }
        [pscustomobject]@{
            Name = $task.TaskName; Path = $task.TaskPath; State = [string]$task.State
            Account = $task.Principal.UserId; LogonType = [string]$task.Principal.LogonType; RunLevel = [string]$task.Principal.RunLevel
            LastRunTime = if ($info) { $info.LastRunTime.ToString('o') } else { $null }
            LastResult = if ($info) { '0x{0:X8}' -f ([long]$info.LastTaskResult -band 4294967295) } else { $null }
            LastResultMeaning = if ($info) { Get-TaskResultMeaning ([long]$info.LastTaskResult) } else { $null }
            Actions = @($task.Actions | ForEach-Object { $program = Get-SafeProgram ([string]$_.Execute); [pscustomobject]@{
                Program = $program
                ProgramHasExtraText = ([string]$_.Execute).Trim().Trim('"') -ne $program
                ProgramFileExists = if ([IO.Path]::IsPathRooted($program)) { Test-Path -LiteralPath $program -PathType Leaf } else { $null }
                StartIn = $_.WorkingDirectory; StartInMissing = [string]::IsNullOrWhiteSpace($_.WorkingDirectory)
                Launch = Get-SafeLaunchInfo -Arguments ([string]$_.Arguments)
            } })
            Triggers = @($task.Triggers | ForEach-Object { [pscustomobject]@{ Type = $_.CimClass.CimClassName; Enabled = $_.Enabled; Delay = $_.Delay; StartBoundary = $_.StartBoundary } })
            ExecutionTimeLimit = $task.Settings.ExecutionTimeLimit
            RestartCount = $task.Settings.RestartCount; RestartInterval = $task.Settings.RestartInterval
            StartWhenAvailable = $task.Settings.StartWhenAvailable; NetworkRequired = $task.Settings.RunOnlyIfNetworkAvailable
            DisallowStartOnBattery = $task.Settings.DisallowStartIfOnBatteries; StopOnBattery = $task.Settings.StopIfGoingOnBatteries
        }
    })
    if ($report.Tasks.Count -eq 0) { $notes.Add('No matching task was found. Run again with -TaskName followed by the exact task name, or inspect Task Scheduler manually.') }
} catch { $failures.Add('Tasks: ' + $_.Exception.GetType().Name) }
try {
    $report.Services = @(Get-CimInstance Win32_Service | Where-Object { ($_.Name + ' ' + $_.DisplayName) -match '(?i)cloudflared|supernet|recruitment' } | Select-Object Name, State, StartMode, StartName, ProcessId)
} catch { $failures.Add('Services: ' + $_.Exception.GetType().Name) }
try { $report.ExecutionPolicies = @(Get-ExecutionPolicy -List | Select-Object Scope, ExecutionPolicy) } catch { $failures.Add('ExecutionPolicies: ' + $_.Exception.GetType().Name) }

Write-Host 'Checking system/public DNS; blocked resolvers can take several seconds...'
foreach ($resolver in @('', '1.1.1.1', '8.8.8.8')) {
    try {
        $parameters = @{ Name = $PublicHostname; Type = 'A'; DnsOnly = $true; QuickTimeout = $true; ErrorAction = 'Stop' }
        if ($resolver) { $parameters.Server = $resolver }
        $records = @(Resolve-DnsName @parameters | Where-Object { $_.Type -eq 'A' -or $_.Type -eq 'CNAME' } | Select-Object Name, Type, IPAddress, NameHost)
        $report.DNS += [pscustomobject]@{ Resolver = if ($resolver) { $resolver } else { 'System default' }; Status = 'Answered'; Records = $records }
    } catch {
        $report.DNS += [pscustomobject]@{ Resolver = if ($resolver) { $resolver } else { 'System default' }; Status = 'Failed'; ErrorCode = $_.Exception.NativeErrorCode; ErrorType = $_.Exception.GetType().Name }
    }
}

$report.Notes = @($notes.ToArray())
$report.CollectionFailures = @($failures.ToArray())
$report.Privacy = 'Raw process command lines, task arguments, service commands, tokens, environment values, and database contents are omitted.'
$json = $report | ConvertTo-Json -Depth 10
if (-not $ReportPath) { $ReportPath = Join-Path $repo ('.data\diagnostics\startup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json') }
$ReportPath = [IO.Path]::GetFullPath($ReportPath)
$parent = Split-Path -Parent $ReportPath
if (-not (Test-Path -LiteralPath $parent)) { $null = New-Item -ItemType Directory -Path $parent -Force }
Set-Content -LiteralPath $ReportPath -Value $json -Encoding UTF8
Write-Output $json
Write-Host ('Report saved: ' + $ReportPath)
Write-Host 'No tasks, services, processes, DNS settings, or application data were changed.'
