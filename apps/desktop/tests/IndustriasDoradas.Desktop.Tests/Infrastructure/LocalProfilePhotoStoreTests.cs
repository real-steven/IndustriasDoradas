using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using IndustriasDoradas.Desktop.Application.Profile;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using IndustriasDoradas.Desktop.Infrastructure.Profile;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class LocalProfilePhotoStoreTests
{
    private static readonly Guid ProfileId = Guid.Parse("a1000000-0000-4000-8000-000000000002");
    private string root = string.Empty;
    private LocalProfilePhotoStore store = null!;

    [TestInitialize]
    public void Create()
    {
        root = Path.Combine(Path.GetTempPath(), "id-profile-photo-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        store = new LocalProfilePhotoStore(Path.Combine(root, "profile-photos"));
    }

    [TestCleanup]
    public void Delete()
    {
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }

    [TestMethod]
    public async Task ImportFixesOrientationResizesAndStripsMetadata()
    {
        // 600x300: mitad izquierda roja, derecha azul, con orientación EXIF 6 (girar 90°) y un comentario.
        string source = WriteJpeg("origen.jpg", 600, 300, orientation: 6, comment: "SECRETO-GPS");

        Assert.AreEqual(PhotoImportStatus.Saved, await store.ImportAsync(ProfileId, source));

        byte[] saved = store.Load(ProfileId) ?? throw new AssertFailedException("No se guardó la foto.");
        BitmapFrame frame = Decode(saved);
        Assert.AreEqual(LocalProfilePhotoStore.OutputSize, frame.PixelWidth);
        Assert.AreEqual(LocalProfilePhotoStore.OutputSize, frame.PixelHeight);
        // Girada: arriba queda el rojo y abajo el azul; sin girar, la esquina inferior izquierda sería roja.
        Color bottomLeft = PixelAt(frame, 5, LocalProfilePhotoStore.OutputSize - 5);
        Assert.IsTrue(bottomLeft.B > 150 && bottomLeft.R < 100, $"Orientación no aplicada: {bottomLeft}");
        Assert.IsFalse(System.Text.Encoding.Latin1.GetString(saved).Contains("SECRETO-GPS", StringComparison.Ordinal));
        Assert.IsFalse(ContainsExif(saved), "La copia no debe conservar EXIF.");
    }

    [TestMethod]
    public async Task AcceptsPng()
    {
        string source = Path.Combine(root, "foto.png");
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(Solid(200, 200, Colors.Green)));
        using (FileStream stream = File.Create(source)) encoder.Save(stream);

        Assert.AreEqual(PhotoImportStatus.Saved, await store.ImportAsync(ProfileId, source));
        Assert.IsNotNull(store.Load(ProfileId));
    }

    [TestMethod]
    public async Task RejectsOversizedFilesBeforeDecoding()
    {
        string source = Path.Combine(root, "enorme.jpg");
        using (FileStream stream = File.Create(source))
        {
            stream.Write([0xFF, 0xD8, 0xFF]);
            stream.SetLength(LocalProfilePhotoStore.MaxSourceBytes + 1);
        }

        Assert.AreEqual(PhotoImportStatus.TooLarge, await store.ImportAsync(ProfileId, source));
        Assert.IsNull(store.Load(ProfileId));
    }

    [TestMethod]
    public async Task RejectsFilesWhoseRealContentIsNotJpegOrPng()
    {
        string disguised = Path.Combine(root, "foto.jpg");
        await File.WriteAllTextAsync(disguised, "<svg xmlns='http://www.w3.org/2000/svg'/>");
        string gif = Path.Combine(root, "foto.png");
        await File.WriteAllBytesAsync(gif, "GIF89a\u0001\u0000"u8.ToArray());

        Assert.AreEqual(PhotoImportStatus.Unsupported, await store.ImportAsync(ProfileId, disguised));
        Assert.AreEqual(PhotoImportStatus.Unsupported, await store.ImportAsync(ProfileId, gif));
        Assert.IsFalse(Directory.Exists(store.Directory) && Directory.EnumerateFiles(store.Directory).Any());
    }

    [TestMethod]
    public async Task RejectsCorruptAndTinyImages()
    {
        string corrupt = Path.Combine(root, "dañada.jpg");
        await File.WriteAllBytesAsync(corrupt, [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x01, 0x02, 0x03]);
        string tiny = WriteJpeg("mini.jpg", 20, 20);

        Assert.AreEqual(PhotoImportStatus.Corrupt, await store.ImportAsync(ProfileId, corrupt));
        Assert.AreEqual(PhotoImportStatus.TooSmall, await store.ImportAsync(ProfileId, tiny));
    }

    [TestMethod]
    public async Task DeletingTheSourceDoesNotAffectTheLocalCopy()
    {
        string source = WriteJpeg("origen.jpg", 300, 300);
        await store.ImportAsync(ProfileId, source);

        File.Delete(source);

        Assert.IsNotNull(store.Load(ProfileId));
    }

    [TestMethod]
    public async Task CorruptLocalCopyFallsBackToInitials()
    {
        await store.ImportAsync(ProfileId, WriteJpeg("origen.jpg", 300, 300));
        await File.WriteAllBytesAsync(store.PathFor(ProfileId), [0xFF, 0xD8, 0xFF, 0x00, 0x01]);

        Assert.IsNull(store.Load(ProfileId));
        Assert.IsNull(store.Load(Guid.NewGuid()), "Sin foto también se usan las iniciales.");
    }

    [TestMethod]
    public async Task RemoveDeletesOnlyTheLocalCopy()
    {
        string source = WriteJpeg("origen.jpg", 300, 300);
        await store.ImportAsync(ProfileId, source);

        store.Remove(ProfileId);

        Assert.IsNull(store.Load(ProfileId));
        Assert.IsFalse(File.Exists(store.PathFor(ProfileId)));
        Assert.IsTrue(File.Exists(source), "Quitar nunca toca el archivo original.");
    }

    [TestMethod]
    public void PhotosLiveOutsideTheStationDatabaseFolderSoBackupsAndOutboxNeverIncludeThem()
    {
        var databasePath = new StationDatabasePathProvider(
            Options.Create(new StationOptions { Id = Guid.Parse("34000000-0000-4000-8000-000000000001") }),
            Options.Create(new LocalDatabaseOptions()));
        string stationFolder = Path.GetDirectoryName(databasePath.DatabasePath)!;
        string photos = LocalProfilePhotoStore.DefaultDirectory();

        Assert.IsFalse(
            photos.StartsWith(stationFolder, StringComparison.OrdinalIgnoreCase),
            "El respaldo y el diagnóstico solo leen la base SQLite de la estación.");
        StringAssert.EndsWith(photos, "profile-photos");
        // La foto no tiene ninguna dependencia de SQLite/Outbox/sincronización: solo una carpeta.
        Assert.AreEqual(1, typeof(LocalProfilePhotoStore).GetConstructors().Single().GetParameters().Length);
        Assert.AreEqual(typeof(string), typeof(LocalProfilePhotoStore).GetConstructors().Single().GetParameters()[0].ParameterType);
    }

    private string WriteJpeg(string name, int width, int height, ushort? orientation = null, string? comment = null)
    {
        var metadata = new BitmapMetadata("jpg");
        if (orientation is not null) metadata.SetQuery("/app1/ifd/{ushort=274}", orientation.Value);
        if (comment is not null) metadata.Comment = comment;
        var encoder = new JpegBitmapEncoder { QualityLevel = 95 };
        encoder.Frames.Add(BitmapFrame.Create(SplitImage(width, height), null, metadata, null));
        string path = Path.Combine(root, name);
        using FileStream stream = File.Create(path);
        encoder.Save(stream);
        return path;
    }

    private static BitmapSource SplitImage(int width, int height)
    {
        int stride = width * 3;
        byte[] pixels = new byte[stride * height];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int i = (y * stride) + (x * 3);
                bool left = x < width / 2;
                pixels[i] = left ? (byte)0 : (byte)255; // B
                pixels[i + 1] = 0; // G
                pixels[i + 2] = left ? (byte)255 : (byte)0; // R
            }
        }
        BitmapSource bitmap = BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgr24, null, pixels, stride);
        bitmap.Freeze();
        return bitmap;
    }

    private static BitmapSource Solid(int width, int height, Color color)
    {
        int stride = width * 3;
        byte[] pixels = new byte[stride * height];
        for (int i = 0; i < pixels.Length; i += 3)
        {
            pixels[i] = color.B;
            pixels[i + 1] = color.G;
            pixels[i + 2] = color.R;
        }
        return BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgr24, null, pixels, stride);
    }

    private static BitmapFrame Decode(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes);
        return BitmapDecoder.Create(stream, BitmapCreateOptions.None, BitmapCacheOption.OnLoad).Frames[0];
    }

    private static Color PixelAt(BitmapSource source, int x, int y)
    {
        var converted = new FormatConvertedBitmap(source, PixelFormats.Bgr24, null, 0);
        byte[] pixel = new byte[3];
        converted.CopyPixels(new Int32Rect(x, y, 1, 1), pixel, 3, 0);
        return Color.FromRgb(pixel[2], pixel[1], pixel[0]);
    }

    private static bool ContainsExif(byte[] bytes)
    {
        for (int i = 0; i + 6 < bytes.Length; i++)
        {
            if (bytes[i] == 0xFF && bytes[i + 1] == 0xE1) return true;
        }
        return false;
    }
}
