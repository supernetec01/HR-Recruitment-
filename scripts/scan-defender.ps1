param([string]$ScanPath = '', [int]$MaxSignatureAgeDays = 7)
$ErrorActionPreference = 'Stop'
try {
    $status = Get-MpComputerStatus
    if (-not $status.AntivirusEnabled -or -not $status.AMServiceEnabled -or $status.AntivirusSignatureAge -gt $MaxSignatureAgeDays) {
        throw 'Defender is unavailable or signatures are outdated.'
    }
    $result = @{
        engine = 'Microsoft Defender'
        version = [string]$status.AMProductVersion
        signatureVersion = [string]$status.AntivirusSignatureVersion
        signatureDate = $status.AntivirusSignatureLastUpdated.ToUniversalTime().ToString('o')
    }
    if ($ScanPath) {
        $platform = Join-Path $env:ProgramData 'Microsoft\Windows Defender\Platform'
        $executable = Get-ChildItem -LiteralPath $platform -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName 'MpCmdRun.exe' } |
            Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if (-not $executable) { $executable = Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe' }
        if (-not (Test-Path -LiteralPath $executable)) { throw 'Defender command is unavailable.' }
        # Generated temporary path, passed as an argument. Never execute the uploaded file.
        $arguments = @('-Scan', '-ScanType', '3', '-File', ('"' + $ScanPath + '"'), '-DisableRemediation')
        $scan = Start-Process -FilePath $executable -ArgumentList $arguments -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput ($ScanPath + '.stdout') -RedirectStandardError ($ScanPath + '.stderr')
        $null = $scan.Handle
        if (-not $scan.WaitForExit(25000)) { $scan.Kill(); throw 'Defender scan timed out.' }
        if ($scan.ExitCode -eq 0) { $result.status = 'clean' }
        elseif ($scan.ExitCode -eq 2) { $result.status = 'blocked' }
        else { throw 'Defender could not complete the scan.' }
    }
    $result | ConvertTo-Json -Compress
} catch {
    @{ status = 'unavailable' } | ConvertTo-Json -Compress
    exit 1
}
