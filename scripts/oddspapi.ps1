param(
  [Parameter(Mandatory=$true)][string]$RoundPath,
  [switch]$SaveKey,
  [switch]$AccountOnly,
  [switch]$ShadowCycle,
  [switch]$ShadowPreview,
  [string]$StudyPath,
  [string]$SchedulePath,
  [switch]$RefreshData,
  [string]$ExperimentalJournalPath,
  [string]$ExperimentalStudyPath,
  [string]$ContextPath,
  [string]$ContextEvidencePath
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$privateDirectory = Join-Path $projectRoot '.local/oddspapi'
$keyFile = Join-Path $privateDirectory 'api-key.dpapi'
$previousKey = $env:ODDSPAPI_API_KEY
$pointer = [IntPtr]::Zero
if ($ShadowCycle -and ($AccountOnly -or -not $StudyPath -or -not $SchedulePath)) {
  throw 'ShadowCycle richiede StudyPath e SchedulePath; AccountOnly non compatibile.'
}
if ($ExperimentalJournalPath -and -not $ExperimentalStudyPath) {
  throw 'ExperimentalJournalPath richiede ExperimentalStudyPath.'
}
if ($ContextPath -and $ContextEvidencePath) { throw 'Scegli ContextPath oppure ContextEvidencePath.' }
if (-not $ShadowCycle -and ($ShadowPreview -or $RefreshData -or $StudyPath -or $SchedulePath -or $ExperimentalJournalPath -or $ExperimentalStudyPath -or $ContextPath -or $ContextEvidencePath)) {
  throw 'Le opzioni ShadowPreview/RefreshData/StudyPath/SchedulePath richiedono ShadowCycle.'
}
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
  if ($ShadowCycle) {
    $nodeArguments = @((Join-Path $PSScriptRoot 'shadow.mjs'), '--cycle', '--live-odds', '--round', $RoundPath, '--study', $StudyPath, '--schedule', $SchedulePath)
    if ($RefreshData) { $nodeArguments += '--refresh-data' }
    if ($ShadowPreview) { $nodeArguments += '--preview' }
    if ($ExperimentalStudyPath) { $nodeArguments += @('--extension-study', $ExperimentalStudyPath) }
    if ($ExperimentalJournalPath) { $nodeArguments += @('--extension-journal', $ExperimentalJournalPath) }
    if ($ContextPath) { $nodeArguments += @('--context', $ContextPath) }
    if ($ContextEvidencePath) { $nodeArguments += @('--context-evidence', $ContextEvidencePath) }
  } else {
    $nodeArguments = @((Join-Path $PSScriptRoot 'oddspapi.mjs'), '--round', $RoundPath)
  }
  if ($AccountOnly) { $nodeArguments += '--account-only' }
  & node @nodeArguments
  if ($LASTEXITCODE -ne 0) { throw 'Importazione non riuscita; nessun nuovo tentativo automatico.' }
} finally {
  $env:ODDSPAPI_API_KEY = $previousKey
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ($protectedKey) { $protectedKey.Dispose() }
}
