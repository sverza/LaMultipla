param(
    [Parameter(Mandatory=$true)][string]$TaskXmlPath,
    [ValidateSet('Delivery', 'Analysis', 'Progressive')][string]$TaskKind = 'Delivery'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$privateRoot = [IO.Path]::GetFullPath((Join-Path $root '.local/orchestrator/task-preparations'))
$xmlPath = [IO.Path]::GetFullPath($TaskXmlPath)
if (-not $xmlPath.StartsWith($privateRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'XML richiesto nella cartella privata delle preparazioni.'
}
$text = [IO.File]::ReadAllText($xmlPath)
try { [xml]$definition = $text } catch { throw 'XML non valido: nessun contenuto privato stampato.' }
if ($definition.Task.Settings.Enabled -ne 'false') { throw 'La preparazione deve essere disabilitata.' }
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
# Windows rejects the UTF-8 declaration at the Unicode COM string boundary.
# Keep original file bytes/hash; parse and reserialize only an in-memory copy.
$comText = $text -replace '^\s*<\?xml[^>]+\?>\s*', ''
try {
    $nativeDefinition = $service.NewTask(0)
    $nativeDefinition.XmlText = $comText
    if ($nativeDefinition.Settings.Enabled) { throw 'Preparazione inattesa.' }
    $nativeXml = [string]$nativeDefinition.XmlText
} catch {
    $code = '0x{0:X8}' -f $_.Exception.HResult
    throw "Parser Windows non riuscito ($code). Nessun task registrato."
}
$folder = $service.GetFolder('\')
$name = if ($TaskKind -eq 'Progressive') { 'LaMultipla progressive analysis shadow' } elseif ($TaskKind -eq 'Analysis') { 'LaMultipla private analysis shadow' } else { 'LaMultipla private delivery shadow' }
if ($TaskKind -eq 'Progressive' -and $definition.Task.Actions.Exec.Arguments -notmatch '--progressive-once .* --config-sha256 [a-f0-9]{64}$') {
    throw 'Preparazione progressiva senza configurazione vincolata: nessun task registrato.'
}
if ($TaskKind -eq 'Analysis' -and $definition.Task.Actions.Exec.Arguments -notmatch '--analysis-once .* --plan-sha256 [a-f0-9]{64}$') {
    throw 'Preparazione analitica senza piano vincolato: nessun task registrato.'
}
function Exists-PreparedTask {
    try { $null = $folder.GetTask($name); return $true } catch { return $false }
}
$before = Exists-PreparedTask
# TASK_VALIDATE_ONLY = 1 checks XML without registering or enabling a task.
try {
    $null = $folder.RegisterTask($name, $nativeXml, 1, $null, $null, 3, $null)
} catch {
    $code = '0x{0:X8}' -f $_.Exception.HResult
    throw "Validazione COM non riuscita ($code). Nessun task registrato."
}
$after = Exists-PreparedTask
if ($before -ne $after) { throw 'Stato del task cambiato: verificare prima di proseguire.' }
[pscustomobject]@{
    ValidatoDaWindows = $true
    SolaValidazione = $true
    NormalizzatoInMemoria = $true
    TaskRegistratoDaQuestaOperazione = $false
    PreparazioneAbilitata = $false
    SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $xmlPath).Hash
} | ConvertTo-Json
