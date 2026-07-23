param(
    [string]$Blender = 'C:\Program Files\Blender Foundation\Blender 2.83\blender.exe',
    [string]$Python = 'python'
)

$ErrorActionPreference = 'Stop'
$sourceDir = [IO.Path]::GetFullPath($PSScriptRoot)
$artDir = [IO.Path]::GetFullPath((Join-Path $sourceDir '..'))
$outputDir = Join-Path $artDir 'output'
$generator = Join-Path $sourceDir 'build_resonance_garden_kit.py'
$finalizer = Join-Path $sourceDir 'finalize_resonance_garden.py'
$rawGlb = Join-Path $outputDir 'afterlight_resonance_garden_kit.raw.glb'
$runtimeGlb = Join-Path $outputDir 'afterlight_resonance_garden_kit.runtime.draco.glb'
$roundtripGlb = Join-Path $outputDir '.resonance_garden_draco_roundtrip.glb'
$transformPackage = '@gltf-transform/cli@4.4.1'

if (-not (Test-Path -LiteralPath $Blender)) {
    throw "Blender executable was not found: $Blender"
}

& $Blender --background --python $generator
if ($LASTEXITCODE -ne 0) {
    throw "Blender generator failed with exit code $LASTEXITCODE"
}

& npx --yes $transformPackage draco $rawGlb $runtimeGlb --method edgebreaker
if ($LASTEXITCODE -ne 0) {
    throw "Pinned glTF Transform Draco build failed with exit code $LASTEXITCODE"
}

& npx --yes $transformPackage copy $runtimeGlb $roundtripGlb
if ($LASTEXITCODE -ne 0) {
    throw "Pinned Draco decoder round-trip failed with exit code $LASTEXITCODE"
}

$resolvedRoundtrip = [IO.Path]::GetFullPath($roundtripGlb)
if (-not $resolvedRoundtrip.StartsWith(
        [IO.Path]::GetFullPath($outputDir) + [IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a round-trip file outside the output directory"
}
Remove-Item -LiteralPath $resolvedRoundtrip -Force

& $Python $finalizer --tool-version 4.4.1 --draco-roundtrip-ok
if ($LASTEXITCODE -ne 0) {
    throw "Manifest/checksum finalizer failed with exit code $LASTEXITCODE"
}

Write-Output 'RESONANCE_GARDEN_BUILD_PIPELINE_OK'
