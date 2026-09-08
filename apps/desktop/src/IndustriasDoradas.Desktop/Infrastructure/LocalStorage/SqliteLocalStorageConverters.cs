using System.Globalization;
using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

internal static class SqliteLocalStorageConverters
{
    public static string Id(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("El UUID es obligatorio.", parameterName);
        }

        return value.ToString("D");
    }

    public static string Text(string value, string parameterName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value, parameterName);
        return value.Trim();
    }

    public static string Timestamp(DateTimeOffset value) =>
        value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);

    public static DateTimeOffset ReadTimestamp(string value) =>
        DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind)
            .ToUniversalTime();

    public static string Status(LineFeedCycleStatus value) => value switch
    {
        LineFeedCycleStatus.Active => "ACTIVE",
        LineFeedCycleStatus.Completed => "COMPLETED",
        _ => throw new ArgumentOutOfRangeException(nameof(value)),
    };

    public static LineFeedCycleStatus ReadStatus(string value) => value switch
    {
        "ACTIVE" => LineFeedCycleStatus.Active,
        "COMPLETED" => LineFeedCycleStatus.Completed,
        _ => throw new InvalidOperationException($"Estado SQLite desconocido: {value}."),
    };

    public static string EventType(ProductionEventType value) => value switch
    {
        ProductionEventType.CajuelaAdded => "CAJUELA_ADDED",
        ProductionEventType.CajuelaReversed => "CAJUELA_REVERSED",
        _ => throw new ArgumentOutOfRangeException(nameof(value)),
    };

    public static string WorkPeriod(WorkPeriod value) => value switch
    {
        Domain.Production.WorkPeriod.Day => "DAY",
        Domain.Production.WorkPeriod.Night => "NIGHT",
        _ => throw new ArgumentOutOfRangeException(nameof(value)),
    };
}
