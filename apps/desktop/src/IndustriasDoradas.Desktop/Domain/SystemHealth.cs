namespace IndustriasDoradas.Desktop.Domain;

public enum HealthState
{
    NotChecked,
    Checking,
    Available,
    Unavailable,
}

public sealed record SystemHealth(
    HealthState State,
    string Service,
    DateTimeOffset? CheckedAt,
    string Detail)
{
    public static SystemHealth Available(string service, DateTimeOffset checkedAt) =>
        new(HealthState.Available, service, checkedAt, "La API respondió correctamente.");

    public static SystemHealth Unavailable(string detail) =>
        new(HealthState.Unavailable, "No disponible", null, detail);
}
