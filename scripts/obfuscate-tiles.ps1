# Run from the repo root to regenerate tile-images.json from tile-images.source.json.
# Also renames any new image files that haven't been hashed yet.
# Usage: .\scripts\obfuscate-tiles.ps1

$root    = Split-Path $PSScriptRoot -Parent
$srcPath = "$root\tile-images.source.json"
$outPath = "$root\tile-images.json"
$imgDir  = "$root\images"

if (-not (Test-Path $srcPath)) {
    Write-Error "tile-images.source.json not found. Nothing to do."
    exit 1
}

$data = Get-Content $srcPath -Raw -Encoding UTF8 | ConvertFrom-Json

$sha = [System.Security.Cryptography.SHA256]::Create()
$fileHashMap = @{}

foreach ($key in $data.PSObject.Properties.Name) {
    $img = $data.$key.image
    if (-not $img) { continue }
    $filename = [System.IO.Path]::GetFileName($img)
    if ($fileHashMap.ContainsKey($filename)) { continue }
    $ext     = [System.IO.Path]::GetExtension($filename)
    $bytes   = [System.Text.Encoding]::UTF8.GetBytes($filename)
    $hashHex = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
    $fileHashMap[$filename] = $hashHex.Substring(0, 10) + $ext
}

# Rename any image files that still have their original name
foreach ($orig in $fileHashMap.Keys) {
    $oldPath = Join-Path $imgDir $orig
    $newPath = Join-Path $imgDir $fileHashMap[$orig]
    if ((Test-Path $oldPath) -and -not (Test-Path $newPath)) {
        Rename-Item -LiteralPath $oldPath -NewName $fileHashMap[$orig]
        Write-Host "Renamed: $orig -> $($fileHashMap[$orig])"
    }
}

# Write obfuscated JSON — format: { "tile name": "images/hashedfile" }
$lines = @('{')
$keys  = $data.PSObject.Properties.Name
for ($i = 0; $i -lt $keys.Count; $i++) {
    $k     = $keys[$i]
    $entry = $data.$k
    $comma = if ($i -lt $keys.Count - 1) { ',' } else { '' }

    $escapedName = $entry.name -replace '"', '\"'

    if ($entry.image) {
        $filename    = [System.IO.Path]::GetFileName($entry.image)
        $imageValue  = '"images/' + $fileHashMap[$filename] + '"'
    } else {
        $imageValue  = 'null'
    }

    $lines += ('  "{0}": {1}{2}' -f $escapedName, $imageValue, $comma)
}
$lines += '}'

[System.IO.File]::WriteAllText($outPath, ($lines -join "`n"), [System.Text.Encoding]::UTF8)
Write-Host "Written: tile-images.json ($($keys.Count) entries)"
