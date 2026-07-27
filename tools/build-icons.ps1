# Génère les icônes de l'application depuis docs/Logo AeroVigi.png.
#
# Deux pièges traités ici :
#
# 1. Android recadre les icônes adaptatives en cercle ou en squircle : seul le
#    disque central (~66 % de la largeur) est garanti visible. Le logo étant une
#    illustration pleine page dont les ailes touchent presque les bords, il est
#    réduit et centré pour le calque avant, et le fond est reconstitué par un
#    dégradé repris du ciel du logo.
#
# 2. App Store Connect REFUSE une icône comportant un canal alpha. Or le
#    rééchantillonnage bicubique de GDI+ échantillonne au-delà des bords de la
#    source et y laisse des pixels semi-transparents, même à partir d'une source
#    totalement opaque. D'où, ci-dessous, le WrapMode TileFlipXY (qui borne
#    l'échantillonnage) et une icône iOS écrite en 24 bits sans alpha du tout.
#
# Lancement : powershell -ExecutionPolicy Bypass -File tools/build-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'docs\Logo AeroVigi.png'
$assets = Join-Path $root 'apps\mobile\assets'

$logo = [System.Drawing.Image]::FromFile($src)
Write-Output "Source : $($logo.Width)x$($logo.Height) $($logo.PixelFormat)"

function Save-Png($bitmap, $name) {
    $path = Join-Path $assets $name
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output ("  {0,-30} {1}x{2}  {3}" -f $name, $bitmap.Width, $bitmap.Height, $bitmap.PixelFormat)
}

function New-Canvas($size, $format) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, $format)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    return @($bmp, $g)
}

# Dessin borné : sans TileFlipXY, l'interpolation lit hors de l'image source et
# produit un liseré semi-transparent tout autour du résultat.
function Draw-Bounded($g, $img, $x, $y, $w, $h) {
    $attr = New-Object System.Drawing.Imaging.ImageAttributes
    $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $g.DrawImage($img, $rect, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
    $attr.Dispose()
}

$ARGB = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$RGB = [System.Drawing.Imaging.PixelFormat]::Format24bppRgb

# --- Couleur du ciel, relevée en haut à gauche du logo -----------------------
$probe = New-Object System.Drawing.Bitmap($logo)
$sky = $probe.GetPixel([int]($logo.Width * 0.06), [int]($logo.Height * 0.06))
$skyLow = $probe.GetPixel([int]($logo.Width * 0.06), [int]($logo.Height * 0.32))
$probe.Dispose()
$hex = '#{0:X2}{1:X2}{2:X2}' -f $sky.R, $sky.G, $sky.B
Write-Output "Ciel releve : $hex"

# --- icon.png : le logo tel quel (Android, Expo) -----------------------------
$r = New-Canvas 1024 $ARGB; $bmp = $r[0]; $g = $r[1]
Draw-Bounded $g $logo 0 0 1024 1024
Save-Png $bmp 'icon.png'
$g.Dispose(); $bmp.Dispose()

# --- icon-ios.png : SANS canal alpha, exigence App Store Connect -------------
$r = New-Canvas 1024 $RGB; $bmp = $r[0]; $g = $r[1]
$g.Clear([System.Drawing.Color]::White)
Draw-Bounded $g $logo 0 0 1024 1024
Save-Png $bmp 'icon-ios.png'
$g.Dispose(); $bmp.Dispose()

# --- Calque avant de l'icône adaptative --------------------------------------
# 66 % : le logo entier tient alors dans le disque garanti par Android. Le canal
# alpha est ici légitime — la marge autour du logo doit être transparente.
$r = New-Canvas 1024 $ARGB; $bmp = $r[0]; $g = $r[1]
$inner = [int](1024 * 0.66)
$off = [int]((1024 - $inner) / 2)
Draw-Bounded $g $logo $off $off $inner $inner
Save-Png $bmp 'android-icon-foreground.png'
$g.Dispose(); $bmp.Dispose()

# --- Fond de l'icône adaptative : dégradé de ciel ----------------------------
$r = New-Canvas 1024 $RGB; $bmp = $r[0]; $g = $r[1]
$rect = New-Object System.Drawing.Rectangle(0, 0, 1024, 1024)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $sky, $skyLow, 90.0)
$g.FillRectangle($brush, $rect)
Save-Png $bmp 'android-icon-background.png'
$brush.Dispose(); $g.Dispose(); $bmp.Dispose()

# --- Écran de démarrage et favicon -------------------------------------------
$r = New-Canvas 1024 $ARGB; $bmp = $r[0]; $g = $r[1]
Draw-Bounded $g $logo 0 0 1024 1024
Save-Png $bmp 'splash-icon.png'
$g.Dispose(); $bmp.Dispose()

$r = New-Canvas 48 $ARGB; $bmp = $r[0]; $g = $r[1]
Draw-Bounded $g $logo 0 0 48 48
Save-Png $bmp 'favicon.png'
$g.Dispose(); $bmp.Dispose()

$logo.Dispose()
Write-Output "Termine. Couleur de fond a reporter dans app.json : $hex"
