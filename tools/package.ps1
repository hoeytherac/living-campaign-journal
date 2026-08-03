param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$moduleRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutput

if (-not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

if (Test-Path $resolvedOutput) {
  Remove-Item -LiteralPath $resolvedOutput
}

Compress-Archive -Path (Join-Path $moduleRoot "*") -DestinationPath $resolvedOutput -CompressionLevel Optimal
Write-Output $resolvedOutput
