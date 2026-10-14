# Convert the supplied transparent logos to display assets and a Windows icon.
# Source artwork is preserved; these operations only crop, scale and encode it.
Add-Type -AssemblyName System.Drawing
$brandRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\branding'))
$brandPublicRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public\brand'))
New-Item -ItemType Directory -Path $brandPublicRoot -Force | Out-Null

function Save-BrandCrop($Source, $Destination, $X, $Y, $Width, $Height) {
    $original = [Drawing.Bitmap]::FromFile($Source)
    try {
        $rectangle = [Drawing.Rectangle]::new($X, $Y, $Width, $Height)
        $cropped = $original.Clone($rectangle, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try { $cropped.Save($Destination, [Drawing.Imaging.ImageFormat]::Png) }
        finally { $cropped.Dispose() }
    } finally { $original.Dispose() }
}

Save-BrandCrop (Join-Path $brandRoot 'espresso-logo-original.png') (Join-Path $brandPublicRoot 'espresso-logo.png') 142 167 997 977
Save-BrandCrop (Join-Path $brandRoot 'espresso-mark-original.png') (Join-Path $brandPublicRoot 'espresso-mark.png') 200 221 963 814

$mark = [Drawing.Bitmap]::FromFile((Join-Path $brandPublicRoot 'espresso-mark.png'))
$iconPngs = [Collections.Generic.List[byte[]]]::new()
$sizes = @(16, 24, 32, 48, 64, 128, 256)
try {
    foreach ($size in $sizes) {
        $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $graphics.Clear([Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
        $inset = [Math]::Max(1, $size * 0.045)
        $width = $size - 2 * $inset
        $height = $width * $mark.Height / $mark.Width
        $graphics.DrawImage($mark, [single]$inset, [single](($size - $height) / 2), [single]$width, [single]$height)
        $memory = [IO.MemoryStream]::new()
        try {
            $bitmap.Save($memory, [Drawing.Imaging.ImageFormat]::Png)
            $iconPngs.Add($memory.ToArray())
        } finally { $memory.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $mark.Dispose() }

$iconStream = [IO.File]::Create((Join-Path $brandRoot 'espresso.ico'))
$writer = [IO.BinaryWriter]::new($iconStream)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($index = 0; $index -lt $sizes.Count; $index++) {
        $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$iconPngs[$index].Length); $writer.Write([uint32]$offset)
        $offset += $iconPngs[$index].Length
    }
    foreach ($png in $iconPngs) { $writer.Write($png) }
} finally { $writer.Dispose(); $iconStream.Dispose() }
Write-Output 'Prepared ESPresso logo, cup mark and multi-resolution Windows icon.'
