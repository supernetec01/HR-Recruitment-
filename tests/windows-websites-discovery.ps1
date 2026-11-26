# Run with Windows PowerShell 5.1 or pwsh. No Docker, registry, task or service is changed.
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '..\scripts\start-windows-websites.ps1'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Website startup script did not parse.' }
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
$directoryResolver = ${function:Get-DockerDesktopInstallDirectories}
function Assert-Discovery { param($Condition, [string]$Message) if (-not $Condition) { throw $Message } }
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('supernet-desktop-discovery-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $fixtureRoot
try {
    $installation = Join-Path $fixtureRoot 'Custom Docker Location'
    $null = New-Item -ItemType Directory -Path (Join-Path $installation 'resources\bin') -Force
    $desktop = Join-Path $installation 'Docker Desktop.exe'
    $compactDesktop = Join-Path $installation 'DockerDesktop.exe'
    $backend = Join-Path $installation 'com.docker.backend.exe'
    foreach ($file in @($desktop, $compactDesktop, $backend)) { Set-Content -LiteralPath $file -Value 'fixture; never execute' }
    $cli = Join-Path $installation 'resources\bin\docker.exe'
    $localProfile = Join-Path $fixtureRoot 'Profile'
    $programs = Join-Path $fixtureRoot 'Programs'
    $directories = @(& $directoryResolver -DockerCliPath $cli -ProgramRoots @($programs) -LocalAppDataDirectory $localProfile)
    Assert-Discovery ($directories -contains $installation) 'Custom installation was not derived from Docker CLI.'
    Assert-Discovery ($directories -contains (Join-Path $localProfile 'Programs\DockerDesktop')) 'Per-user installation was not included.'
    Assert-Discovery ($directories -contains (Join-Path $programs 'Docker\Docker')) 'Machine-wide installation was not included.'
    Write-Output 'PASS installation locations: custom drive, per-user, machine-wide'

    Assert-Discovery ((Resolve-DesktopCandidate $desktop) -eq $desktop) 'Valid desktop executable rejected.'
    Assert-Discovery ((Resolve-DesktopCandidate ('"' + $desktop + '",0')) -eq $desktop) 'Quoted registry DisplayIcon was not parsed.'
    Assert-Discovery ((Resolve-DesktopCandidate ($desktop + ',-1')) -eq $desktop) 'Unquoted registry DisplayIcon was not parsed.'
    Assert-Discovery (-not (Resolve-DesktopCandidate ($desktop + ' --token DO_NOT_EXPOSE'))) 'Executable arguments were accepted.'
    Assert-Discovery (-not (Resolve-DesktopCandidate $backend)) 'Docker backend was mistaken for Desktop.'
    Assert-Discovery (-not (Resolve-DesktopCandidate 'Docker Desktop.exe')) 'Relative executable was accepted.'
    Assert-Discovery (-not (Resolve-DesktopCandidate ($desktop + "`n" + 'other.exe'))) 'Multiline registry value was accepted.'
    Write-Output 'PASS registry value parsing; arguments/backend/relative paths rejected'

    function Get-Process { param($Name, $ErrorAction) foreach ($value in $script:ProcessPaths) { [pscustomobject]@{ Path = $value } } }
    function Get-DockerDesktopInstallDirectories { param($DockerCliPath, $ProgramRoots, $LocalAppDataDirectory) $script:DirectoryPaths }
    function Get-DockerDesktopRegistryPaths { if ($script:RegistryDenied) { throw 'DO_NOT_EXPOSE_REGISTRY_ERROR' }; $script:RegistryPaths }
    function Get-DockerDesktopShortcutPaths { if ($script:ShortcutDenied) { throw 'DO_NOT_EXPOSE_SHORTCUT_ERROR' }; $script:ShortcutPaths }
    foreach ($case in @('Process', 'Directory', 'Registry', 'Shortcut', 'RegistryDenied', 'Missing', 'Explicit', 'BadExplicit')) {
        $script:ProcessPaths = @(); $script:DirectoryPaths = @(); $script:RegistryPaths = @(); $script:ShortcutPaths = @()
        $script:RegistryDenied = $false; $script:ShortcutDenied = $false
        $request = ''
        switch ($case) {
            'Process' { $script:ProcessPaths = @($desktop) }
            'Directory' { $script:DirectoryPaths = @($installation) }
            'Registry' { $script:RegistryPaths = @('"' + $desktop + '",0') }
            'Shortcut' { $script:ShortcutPaths = @($backend, $compactDesktop) }
            'RegistryDenied' { $script:RegistryDenied = $true; $script:ShortcutPaths = @($desktop) }
            'Missing' { $script:ShortcutDenied = $true }
            'Explicit' { $request = $desktop; $script:ProcessPaths = @($compactDesktop) }
            'BadExplicit' { $request = Join-Path $fixtureRoot 'missing.exe'; $script:ProcessPaths = @($desktop) }
        }
        $failed = $false; $found = $null
        try { $found = Find-DockerDesktop -RequestedPath $request -DockerCliPath $cli } catch {
            $failed = $true
            Assert-Discovery ($_.Exception.Data['WebsitesStartupReason']) 'Uncontrolled discovery error.'
        }
        Assert-Discovery ($failed -eq ($case -eq 'BadExplicit')) ('Unexpected discovery failure: ' + $case)
        if ($case -eq 'Missing') { Assert-Discovery (-not $found) 'Missing installation was invented.' }
        elseif ($case -ne 'BadExplicit') {
            $expected = if ($case -eq 'Shortcut') { $compactDesktop } else { $desktop }
            Assert-Discovery ($found -eq $expected) ('Wrong executable selected: ' + $case)
        }
        Write-Output ('PASS discovery: ' + $case)
    }
} finally { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
