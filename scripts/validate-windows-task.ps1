param([Parameter(Mandatory=$true)][string]$TaskXmlPath)
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
$folder = $service.GetFolder('\')
$name = 'LaMultipla private delivery shadow'
function Exists-PreparedTask {
    try { $null = $folder.GetTask($name); return $true } catch { return $false }
}
$before = Exists-PreparedTask
# TASK_VALIDATE_ONLY = 1 checks XML without registering or enabling a task.
try {
    $null = $folder.RegisterTask($name, $text, 1, $null, $null, 3, $null)
} catch {
    $code = '0x{0:X8}' -f $_.Exception.HResult
    throw "Validazione COM non riuscita ($code). Nessun task registrato."
}
$after = Exists-PreparedTask
if ($before -ne $after) { throw 'Stato del task cambiato: verificare prima di proseguire.' }
[pscustomobject]@{
    ValidatoDaWindows = $true
    SolaValidazione = $true
    TaskRegistratoDaQuestaOperazione = $false
    PreparazioneAbilitata = $false
    SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $xmlPath).Hash
} | ConvertTo-Json
