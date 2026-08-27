using System.IO;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public enum LocalStorageFailureKind
{
    Locked,
    DiskFull,
    Corrupt,
    Unavailable,
    Unknown,
}

public sealed record LocalStorageFailure(
    LocalStorageFailureKind Kind,
    string UserMessage,
    string RecoveryInstruction);

public static class LocalStorageFailureClassifier
{
    public static LocalStorageFailure Classify(Exception exception)
    {
        ArgumentNullException.ThrowIfNull(exception);
        SqliteException? sqlite = FindSqlite(exception);
        if (sqlite is not null)
        {
            return sqlite.SqliteErrorCode switch
            {
                5 or 6 => new(
                    LocalStorageFailureKind.Locked,
                    "La base local está ocupada temporalmente.",
                    "Cierre otra instancia de la aplicación y vuelva a intentar; no copie ni borre archivos SQLite."),
                13 => new(
                    LocalStorageFailureKind.DiskFull,
                    "El equipo no tiene espacio suficiente para guardar la operación.",
                    "Libere espacio en el disco y reintente. El conteo no cambió."),
                11 or 26 => new(
                    LocalStorageFailureKind.Corrupt,
                    "La base local no superó la comprobación de integridad.",
                    "Detenga la operación y solicite restauración desde una copia validada; no cree una base nueva sobre la existente."),
                8 or 10 or 14 => new(
                    LocalStorageFailureKind.Unavailable,
                    "El almacenamiento local no está disponible para escritura.",
                    "Revise permisos, unidad y conexión del disco antes de reintentar."),
                _ => Unknown(),
            };
        }

        return exception is IOException
            ? new(
                LocalStorageFailureKind.Unavailable,
                "No se pudo acceder al almacenamiento local.",
                "Revise la unidad y sus permisos; los datos existentes no deben borrarse.")
            : Unknown();
    }

    private static SqliteException? FindSqlite(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is SqliteException sqlite) return sqlite;
        }

        return null;
    }

    private static LocalStorageFailure Unknown() => new(
        LocalStorageFailureKind.Unknown,
        "No se pudo comprobar el almacenamiento local.",
        "Conserve la base existente y solicite diagnóstico antes de continuar.");
}
