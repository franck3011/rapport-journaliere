# Lanceur de sauvegarde pour Windows.
#
# 1. Cree un fichier `backup.env` a la racine du projet (ignore par git) :
#      DATABASE_URL=postgresql://postgres.<ref>:<mot-de-passe>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres?sslmode=require
#      BACKUP_DIR=D:\Sauvegardes\dailybrief
#      BACKUP_KEEP=14
#
# 2. Lance :  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
#
# 3. Planifie : Planificateur de taches Windows, tous les jours a 2 h,
#    programme = powershell, arguments =
#      -ExecutionPolicy Bypass -File "C:\...\rapport-journaliere\scripts\backup.ps1"

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "backup.env"

if (-not (Test-Path $envFile)) {
  Write-Host "Fichier backup.env introuvable : $envFile" -ForegroundColor Red
  Write-Host "Cree-le avec la ligne DATABASE_URL=... avant de relancer." -ForegroundColor Yellow
  exit 1
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $index = $line.IndexOf("=")
  if ($index -le 0) { return }
  $name = $line.Substring(0, $index).Trim()
  $value = $line.Substring($index + 1).Trim().Trim('"')
  Set-Item -Path "env:$name" -Value $value
}

Push-Location $root
try {
  node scripts/backup-db.mjs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
