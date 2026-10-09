param(
  [Parameter(Mandatory=$true)][string]$RoundPath,
  [switch]$SaveKey
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$privateDirectory = Join-Path $projectRoot '.local/oddspapi'
$keyFile = Join-Path $privateDirectory 'api-key.dpapi'
$previousKey = $env:ODDSPAPI_API_KEY
$pointer = [IntPtr]::Zero
try {
  if (-not $env:ODDSPAPI_API_KEY) {
    if ((Test-Path $keyFile) -and -not $SaveKey) {
      $protectedKey = Get-Content -Raw $keyFile | ConvertTo-SecureString
    } else {
      $protectedKey = Read-Host 'Chiave OddsPapi (solo sul PC, input nascosto)' -AsSecureString
      if ($SaveKey) {
        New-Item -ItemType Directory -Force -Path $privateDirectory | Out-Null
        # Windows DPAPI: decryptable by this Windows user on this PC, no plaintext file.
        $protectedKey | ConvertFrom-SecureString | Set-Content $keyFile
      }
    }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($protectedKey)
    $env:ODDSPAPI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  & node (Join-Path $PSScriptRoot 'oddspapi.mjs') --round $RoundPath
  if ($LASTEXITCODE -ne 0) { throw 'Importazione non riuscita; nessun nuovo tentativo automatico.' }
} finally {
  $env:ODDSPAPI_API_KEY = $previousKey
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ($protectedKey) { $protectedKey.Dispose() }
}
