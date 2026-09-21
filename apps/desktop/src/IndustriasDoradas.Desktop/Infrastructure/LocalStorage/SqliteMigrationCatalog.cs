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
        Read(4, "immediate_cajuela_correction", "004_immediate_cajuela_correction.sql"),
        Read(5, "operation_input_metrics", "005_operation_input_metrics.sql"),
        Read(6, "multi_line_operations", "006_multi_line_operations.sql"),
        Read(7, "outbox_sync_worker", "007_outbox_sync_worker.sql"),
        Read(8, "incremental_pull", "008_incremental_pull.sql"),
        Read(9, "sync_diagnostics", "009_sync_diagnostics.sql"),
        Read(10, "sync_runtime_status", "010_sync_runtime_status.sql"),
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
