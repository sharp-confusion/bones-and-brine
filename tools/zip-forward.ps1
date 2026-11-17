# Zips a folder with forward-slash paths (what web servers and portals expect).
param([string]$Src, [string]$Dest)
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
if (Test-Path $Dest) { Remove-Item $Dest -Force }
$root = (Resolve-Path $Src).Path.TrimEnd('\') + '\'
$zip = [IO.Compression.ZipFile]::Open($Dest, 'Create')
try {
  Get-ChildItem $Src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length).Replace('\', '/')
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, 'Optimal')
  }
} finally { $zip.Dispose() }
