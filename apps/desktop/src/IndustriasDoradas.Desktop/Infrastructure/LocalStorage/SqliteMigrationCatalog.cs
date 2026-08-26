using System.IO;
using System.Reflection;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed record SqliteMigration(long Version, string Name, string Sql);

public static class SqliteMigrationCatalog
{
    private static readonly Lazy<IReadOnlyList<SqliteMigration>> Migrations = new(Load);

    public static IReadOnlyList<SqliteMigration> All => Migrations.Value;

    private static IReadOnlyList<SqliteMigration> Load() =>
    [
        Read(1, "initial_operation", "001_initial_operation.sql"),
        Read(2, "operation_indexes_and_immutability", "002_operation_indexes_and_immutability.sql"),
        Read(3, "production_counter_read_model", "003_production_counter_read_model.sql"),
    ];

    private static SqliteMigration Read(long version, string name, string fileName)
    {
        Assembly assembly = typeof(SqliteMigrationCatalog).Assembly;
        string resourceName = $"IndustriasDoradas.Desktop.Infrastructure.LocalStorage.Migrations.{fileName}";
        using Stream stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"No se encontró la migración embebida {fileName}.");
        using var reader = new StreamReader(stream);
        return new SqliteMigration(version, name, reader.ReadToEnd());
    }
}
