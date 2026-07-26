# Génère les icônes de l'application depuis docs/Logo VigiAero.png.
#
# Android recadre les icônes adaptatives en cercle ou en squircle : seul le
# disque central (~66 % de la largeur) est garanti visible. Le logo étant une
# illustration pleine page dont les ailes touchent presque les bords, il est
# réduit et centré pour le calque avant, et le fond est reconstitué par un
# dégradé repris du ciel du logo.
#
# Lancement : powershell -ExecutionPolicy Bypass -File tools/build-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'docs\Logo VigiAero clean.png'
$assets = Join-Path $root 'apps\mobile\assets'

$logo = [System.Drawing.Image]::FromFile($src)
Write-Output "Source : $($logo.Width)x$($logo.Height)"

function Save-Png($bitmap, $name) {
    $path = Join-Path $assets $name
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "  $name  ($($bitmap.Width)x$($bitmap.Height))"
}

function New-Canvas($size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    return @($bmp, $g)
}

# --- Couleur du ciel, relevée en haut à gauche du logo -----------------------
$probe = New-Object System.Drawing.Bitmap($logo)
$sky = $probe.GetPixel([int]($logo.Width * 0.06), [int]($logo.Height * 0.06))
$skyLow = $probe.GetPixel([int]($logo.Width * 0.06), [int]($logo.Height * 0.32))
$probe.Dispose()
$hex = '#{0:X2}{1:X2}{2:X2}' -f $sky.R, $sky.G, $sky.B
Write-Output "Ciel releve : $hex"

# --- icon.png : le logo tel quel ---------------------------------------------
$r = New-Canvas 1024; $bmp = $r[0]; $g = $r[1]
$g.DrawImage($logo, 0, 0, 1024, 1024)
Save-Png $bmp 'icon.png'
$g.Dispose(); $bmp.Dispose()

# --- Calque avant de l'icône adaptative --------------------------------------
# 66 % : le logo entier tient alors dans le disque garanti par Android.
$r = New-Canvas 1024; $bmp = $r[0]; $g = $r[1]
$inner = [int](1024 * 0.66)
$off = [int]((1024 - $inner) / 2)
$g.DrawImage($logo, $off, $off, $inner, $inner)
Save-Png $bmp 'android-icon-foreground.png'
$g.Dispose(); $bmp.Dispose()

# --- Fond de l'icône adaptative : dégradé de ciel ----------------------------
$r = New-Canvas 1024; $bmp = $r[0]; $g = $r[1]
$rect = New-Object System.Drawing.Rectangle(0, 0, 1024, 1024)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $sky, $skyLow, 90.0)
$g.FillRectangle($brush, $rect)
Save-Png $bmp 'android-icon-background.png'
$brush.Dispose(); $g.Dispose(); $bmp.Dispose()

# --- Écran de démarrage et favicon -------------------------------------------
$r = New-Canvas 1024; $bmp = $r[0]; $g = $r[1]
$g.DrawImage($logo, 0, 0, 1024, 1024)
Save-Png $bmp 'splash-icon.png'
$g.Dispose(); $bmp.Dispose()

$r = New-Canvas 48; $bmp = $r[0]; $g = $r[1]
$g.DrawImage($logo, 0, 0, 48, 48)
Save-Png $bmp 'favicon.png'
$g.Dispose(); $bmp.Dispose()

$logo.Dispose()
Write-Output "Termine. Couleur de fond a reporter dans app.json : $hex"
