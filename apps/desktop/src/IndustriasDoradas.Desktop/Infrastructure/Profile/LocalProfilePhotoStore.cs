using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using IndustriasDoradas.Desktop.Application.Profile;

namespace IndustriasDoradas.Desktop.Infrastructure.Profile;

/// <summary>
/// Fotografía de perfil local de este equipo y este usuario de Windows:
/// <c>%LOCALAPPDATA%\IndustriasDoradas\profile-photos\{perfil}.jpg</c>, fuera de la carpeta de la
/// estación (SQLite), de modo que no entra en Outbox, sincronización, respaldos ni diagnósticos.
/// Se valida el contenido real (no la extensión), se corrige la orientación, se recorta al
/// centro, se reduce a 256 px y se vuelve a codificar como JPEG sin ningún metadato.
/// </summary>
public sealed class LocalProfilePhotoStore : IProfilePhotoStore
{
    public const long MaxSourceBytes = 8 * 1024 * 1024;
    public const int OutputSize = 256;
    public const int MinSourceSide = 64;
    public const int MaxSourceSide = 12_000;

    public LocalProfilePhotoStore(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        Directory = Path.GetFullPath(directory);
    }

    public string Directory { get; }

    public static string DefaultDirectory() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "IndustriasDoradas",
        "profile-photos");

    public string PathFor(Guid profileId) => Path.Combine(Directory, profileId.ToString("N") + ".jpg");

    public async Task<PhotoImportStatus> ImportAsync(
        Guid profileId,
        string sourcePath,
        CancellationToken cancellationToken = default)
    {
        if (profileId == Guid.Empty) return PhotoImportStatus.Failed;
        byte[] source;
        try
        {
            var info = new FileInfo(sourcePath);
            if (!info.Exists) return PhotoImportStatus.Failed;
            if (info.Length > MaxSourceBytes) return PhotoImportStatus.TooLarge;
            // Se copia todo a memoria: si el archivo original se borra o cambia después, la copia
            // local no se ve afectada.
            source = await File.ReadAllBytesAsync(sourcePath, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return PhotoImportStatus.Failed;
        }

        if (source.Length > MaxSourceBytes) return PhotoImportStatus.TooLarge;
        if (!IsJpeg(source) && !IsPng(source)) return PhotoImportStatus.Unsupported;

        byte[] encoded;
        try
        {
            (PhotoImportStatus status, byte[]? output) = Reencode(source);
            if (output is null) return status;
            encoded = output;
        }
        catch (Exception exception) when (IsImagingFailure(exception))
        {
            return PhotoImportStatus.Corrupt;
        }

        try
        {
            System.IO.Directory.CreateDirectory(Directory);
            string target = PathFor(profileId);
            string temporary = target + ".tmp";
            await File.WriteAllBytesAsync(temporary, encoded, cancellationToken).ConfigureAwait(false);
            File.Move(temporary, target, overwrite: true);
            return PhotoImportStatus.Saved;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return PhotoImportStatus.Failed;
        }
    }

    public byte[]? Load(Guid profileId)
    {
        try
        {
            string path = PathFor(profileId);
            if (!File.Exists(path)) return null;
            byte[] bytes = File.ReadAllBytes(path);
            if (bytes.Length == 0 || bytes.Length > MaxSourceBytes || !IsJpeg(bytes)) return null;
            using var stream = new MemoryStream(bytes, writable: false);
            BitmapDecoder decoder = BitmapDecoder.Create(
                stream, BitmapCreateOptions.IgnoreColorProfile, BitmapCacheOption.OnLoad);
            BitmapFrame frame = decoder.Frames[0];
            return frame.PixelWidth > 0 && frame.PixelHeight > 0 ? bytes : null;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException || IsImagingFailure(exception))
        {
            return null;
        }
    }

    public void Remove(Guid profileId)
    {
        try
        {
            File.Delete(PathFor(profileId));
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Si no se pudo borrar, la próxima carga validará el archivo igualmente.
        }
    }

    private static (PhotoImportStatus Status, byte[]? Output) Reencode(byte[] source)
    {
        using var stream = new MemoryStream(source, writable: false);
        BitmapDecoder decoder = BitmapDecoder.Create(
            stream,
            BitmapCreateOptions.IgnoreColorProfile | BitmapCreateOptions.PreservePixelFormat,
            BitmapCacheOption.OnLoad);
        if (decoder is not JpegBitmapDecoder and not PngBitmapDecoder) return (PhotoImportStatus.Unsupported, null);
        BitmapFrame frame = decoder.Frames[0];
        if (frame.PixelWidth > MaxSourceSide || frame.PixelHeight > MaxSourceSide)
            return (PhotoImportStatus.TooLarge, null);
        if (frame.PixelWidth < MinSourceSide || frame.PixelHeight < MinSourceSide)
            return (PhotoImportStatus.TooSmall, null);

        BitmapSource oriented = ApplyOrientation(frame, ReadOrientation(frame));
        int side = Math.Min(oriented.PixelWidth, oriented.PixelHeight);
        var cropped = new CroppedBitmap(
            oriented,
            new Int32Rect((oriented.PixelWidth - side) / 2, (oriented.PixelHeight - side) / 2, side, side));
        double scale = Math.Min(1d, (double)OutputSize / side);
        BitmapSource resized = new TransformedBitmap(cropped, new ScaleTransform(scale, scale));
        var converted = new FormatConvertedBitmap(resized, PixelFormats.Bgr24, null, 0);
        converted.Freeze();

        // Un frame nuevo sin metadatos: no se copian EXIF, GPS, XMP ni perfiles de color.
        var encoder = new JpegBitmapEncoder { QualityLevel = 88 };
        encoder.Frames.Add(BitmapFrame.Create(converted));
        using var output = new MemoryStream();
        encoder.Save(output);
        return (PhotoImportStatus.Saved, output.ToArray());
    }

    private static int ReadOrientation(BitmapFrame frame)
    {
        try
        {
            if (frame.Metadata is not BitmapMetadata metadata) return 1;
            object? value = metadata.ContainsQuery("System.Photo.Orientation")
                ? metadata.GetQuery("System.Photo.Orientation")
                : null;
            return value switch
            {
                ushort number => number,
                int number => number,
                _ => 1,
            };
        }
        catch (Exception exception) when (exception is NotSupportedException or InvalidOperationException or ArgumentException || exception is COMException)
        {
            return 1;
        }
    }

    private static BitmapSource ApplyOrientation(BitmapSource source, int orientation)
    {
        Transform? transform = orientation switch
        {
            2 => new ScaleTransform(-1, 1),
            3 => new RotateTransform(180),
            4 => new ScaleTransform(1, -1),
            5 => new TransformGroup { Children = { new RotateTransform(90), new ScaleTransform(-1, 1) } },
            6 => new RotateTransform(90),
            7 => new TransformGroup { Children = { new RotateTransform(270), new ScaleTransform(-1, 1) } },
            8 => new RotateTransform(270),
            _ => null,
        };
        return transform is null ? source : new TransformedBitmap(source, transform);
    }

    private static bool IsJpeg(byte[] bytes) =>
        bytes.Length > 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF;

    private static bool IsPng(byte[] bytes) =>
        bytes.Length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 &&
        bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A;

    private static bool IsImagingFailure(Exception exception) =>
        exception is NotSupportedException or FileFormatException or InvalidOperationException or ArgumentException
            or OverflowException or COMException or OutOfMemoryException;
}
