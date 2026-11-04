using System.IO;
using System.Text;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Infrastructure.Sync;

public sealed class FileSyncClientInstanceProvider : ISyncClientInstanceProvider
{
    private readonly object gate = new();
    private readonly string filePath;
    private Guid? cachedId;

    public FileSyncClientInstanceProvider()
        : this(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "IndustriasDoradas",
            "client-instance-id"))
    {
    }

    public FileSyncClientInstanceProvider(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        this.filePath = Path.GetFullPath(filePath);
    }

    public Guid GetId()
    {
        lock (gate)
        {
            if (cachedId is Guid id)
                return id;

            if (File.Exists(filePath))
            {
                cachedId = ReadId();
                return cachedId.Value;
            }

            string? directory = Path.GetDirectoryName(filePath);
            if (string.IsNullOrWhiteSpace(directory))
                throw new InvalidOperationException("La ruta de identidad de instalación no es válida.");
            Directory.CreateDirectory(directory);

            Guid created = Guid.NewGuid();
            try
            {
                using var stream = new FileStream(
                    filePath, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
                using var writer = new StreamWriter(stream, new UTF8Encoding(false));
                writer.Write(created.ToString("D"));
                writer.Flush();
                stream.Flush(flushToDisk: true);
                cachedId = created;
            }
            catch (IOException) when (File.Exists(filePath))
            {
                cachedId = ReadId();
            }

            return cachedId.Value;
        }
    }

    private Guid ReadId()
    {
        string value = File.ReadAllText(filePath, Encoding.UTF8).Trim();
        if (!Guid.TryParseExact(value, "D", out Guid id) || id == Guid.Empty)
            throw new InvalidOperationException(
                "La identidad local de esta instalación está dañada; no se reemplazó para evitar duplicar eventos.");
        return id;
    }
}
