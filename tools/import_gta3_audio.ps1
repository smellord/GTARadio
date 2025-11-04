param([string]$Gta3Dir)
if (-not $Gta3Dir) {
  $Gta3Dir = Read-Host "Enter path to GTA III audio directory"
}
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
python "$ScriptDir\import_gta3_audio.py" --gta3-dir "$Gta3Dir"
