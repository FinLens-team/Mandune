$ErrorActionPreference = 'Stop'

$shCommand = Get-Command sh -ErrorAction SilentlyContinue
if ($shCommand) {
    $shPath = $shCommand.Source
} else {
    $gitPath = (Get-Command git -ErrorAction Stop).Source
    $gitRoot = Split-Path (Split-Path $gitPath -Parent) -Parent
    $shPath = Join-Path $gitRoot 'bin\sh.exe'
}

if (-not (Test-Path -LiteralPath $shPath)) {
    throw 'POSIX shell not found. Install Git for Windows or add sh to PATH.'
}

& $shPath (Join-Path $PSScriptRoot 'test-commit-msg.sh')
exit $LASTEXITCODE
