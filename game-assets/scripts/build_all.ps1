# 4Walls — rebuilds every Phase 1 art asset from source and publishes it to the web client.
# Usage (repo root):  powershell -ExecutionPolicy Bypass -File game-assets/scripts/build_all.ps1
# Requires: Blender 5.x (path below), Node 20+, `pnpm install` done. CC0 sources via fetch_cc0_assets.ps1.
$ErrorActionPreference = 'Stop'
$blender = $env:BLENDER_EXE
if (-not $blender) { $blender = 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' }
$scripts = Join-Path $PSScriptRoot '..\blender\scripts'

if (-not (Test-Path (Join-Path $PSScriptRoot '..\textures\downloaded\SOURCES.json'))) {
  & (Join-Path $PSScriptRoot 'fetch_cc0_assets.ps1')
}
foreach ($s in 'character_kit.py', 'volcanic_kit.py', 'showcase.py') {
  Write-Host "== $s"
  & $blender -b --factory-startup --python (Join-Path $scripts $s) | Select-String '\[4walls\]|Error|Traceback'
  if ($LASTEXITCODE -ne 0) { throw "$s failed" }
}
node (Join-Path $PSScriptRoot 'publish_glb.mjs')
