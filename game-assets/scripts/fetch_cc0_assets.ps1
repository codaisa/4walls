# 4Walls — downloads the CC0 source assets used by the Blender pipeline and records their provenance.
# Originals land in game-assets/textures/downloaded/<library>/<id>/ and are never edited in place.
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File game-assets/scripts/fetch_cc0_assets.ps1

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\textures\downloaded' | Resolve-Path -ErrorAction SilentlyContinue
if (-not $root) { $root = New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot '..\textures\downloaded') }
$headers = @{ 'User-Agent' = '4walls-asset-pipeline' }
$today = (Get-Date).ToString('yyyy-MM-dd')
$records = @()

# Poly Haven: every asset is CC0 (https://polyhaven.com/license).
$polyhaven = @(
  @{ id = 'dark_rock';              kind = 'texture'; maps = @('Diffuse', 'nor_gl', 'Rough') },
  @{ id = 'brown_planks_03';        kind = 'texture'; maps = @('Diffuse', 'nor_gl', 'Rough') },
  @{ id = 'mossy_rock';             kind = 'texture'; maps = @('Diffuse', 'nor_gl', 'Rough') },
  @{ id = 'belfast_sunset_puresky'; kind = 'hdri';    maps = @('hdri') }
)
foreach ($a in $polyhaven) {
  $dir = New-Item -ItemType Directory -Force (Join-Path $root "polyhaven\$($a.id)")
  $info = Invoke-RestMethod -Uri "https://api.polyhaven.com/info/$($a.id)" -Headers $headers
  $files = Invoke-RestMethod -Uri "https://api.polyhaven.com/files/$($a.id)" -Headers $headers
  $saved = @()
  foreach ($m in $a.maps) {
    $entry = if ($a.kind -eq 'hdri') { $files.hdri.'1k'.hdr } else { $files.$m.'1k'.jpg }
    $name = Split-Path $entry.url -Leaf
    Invoke-WebRequest -Uri $entry.url -Headers $headers -OutFile (Join-Path $dir $name)
    $saved += $name
  }
  $records += [ordered]@{
    id = $a.id; library = 'Poly Haven'; kind = $a.kind; url = "https://polyhaven.com/a/$($a.id)"
    authors = @($info.authors.PSObject.Properties.Name); license = 'CC0 1.0'; commercial = $true; attribution = 'not required'
    files = $saved; resolution = '1k'; downloaded = $today
  }
  Write-Host "[poly haven] $($a.id): $($saved -join ', ')"
}

# ambientCG: every asset is CC0 (https://docs.ambientcg.com/license/).
foreach ($id in @('Lava004')) {
  $dir = New-Item -ItemType Directory -Force (Join-Path $root "ambientcg\$id")
  $data = Invoke-RestMethod -Uri "https://ambientcg.com/api/v2/full_json?id=$id&include=downloadData" -Headers $headers
  $dl = $data.foundAssets[0].downloadFolders.default.downloadFiletypeCategories.zip.downloads | Where-Object { $_.attribute -eq '1K-JPG' } | Select-Object -First 1
  $zip = Join-Path $dir "$id`_1K-JPG.zip"
  Invoke-WebRequest -Uri $dl.downloadLink -Headers $headers -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $dir -Force
  Remove-Item $zip
  $records += [ordered]@{
    id = $id; library = 'ambientCG'; kind = 'texture'; url = "https://ambientcg.com/view?id=$id"
    authors = @('ambientCG (Lennart Demes)'); license = 'CC0 1.0'; commercial = $true; attribution = 'not required'
    files = @(Get-ChildItem $dir -File | ForEach-Object Name); resolution = '1K'; downloaded = $today
  }
  Write-Host "[ambientcg] $id"
}

$manifest = Join-Path $root 'SOURCES.json'
($records | ConvertTo-Json -Depth 5) | Out-File -Encoding utf8 $manifest
Write-Host "provenance written to $manifest"
