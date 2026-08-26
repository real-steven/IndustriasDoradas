using System.IO;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public interface ILocalDatabasePathProvider
{
    string DatabasePath { get; }
}

public sealed class StationDatabasePathProvider : ILocalDatabasePathProvider
{
    public StationDatabasePathProvider(
        IOptions<StationOptions> stationOptions,
        IOptions<LocalDatabaseOptions> databaseOptions)
    {
        Guid stationId = stationOptions.Value.Id;
        if (stationId == Guid.Empty)
        {
            throw new InvalidOperationException("No se puede crear la ruta SQLite sin una estación válida.");
        }

        string baseDirectory = string.IsNullOrWhiteSpace(databaseOptions.Value.BaseDirectory)
            ? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "IndustriasDoradas")
            : Path.GetFullPath(databaseOptions.Value.BaseDirectory);

        DatabasePath = Path.Combine(
            baseDirectory,
            "stations",
            stationId.ToString("N"),
            "operation.sqlite3");
    }

    public string DatabasePath { get; }
}
