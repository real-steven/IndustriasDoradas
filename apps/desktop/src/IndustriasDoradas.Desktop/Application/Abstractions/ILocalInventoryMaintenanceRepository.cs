using IndustriasDoradas.Desktop.Domain.Inventory;

namespace IndustriasDoradas.Desktop.Application.Abstractions;

public sealed record LocalRastra(
    Guid Id,
    Guid LineId,
    string LineName,
    string Name)
{
    public string DisplayName => $"{LineName} · {Name}";
}

public sealed record LocalRastraInstallation(
    Guid InstallationId,
    Guid RastraId,
    Guid InventoryItemId,
    string InventoryItemName,
    string? ComponentIdentifier,
    string InstalledCondition,
    DateTimeOffset InstalledAt)
{
    public string DisplayName => string.IsNullOrWhiteSpace(ComponentIdentifier)
        ? $"{InventoryItemName} · {InstalledAt.ToLocalTime():dd/MM/yyyy}"
        : $"{InventoryItemName} · {ComponentIdentifier}";
}

public sealed record LocalOperationalNovelty(
    Guid NoveltyId,
    Guid? LineId,
    string? LineName,
    Guid? CategoryId,
    string? CategoryName,
    string Description,
    DateTimeOffset OpenedAt,
    DateTimeOffset? ClosedAt)
{
    public bool IsOpen => ClosedAt is null;
    public string DisplayName =>
        $"{CategoryName ?? "Sin categoría"} · {LineName ?? "Toda la planta"} · {Description}";
    public string StatusLabel => IsOpen
        ? $"Abierta desde {OpenedAt.ToLocalTime():dd/MM/yyyy HH:mm}"
        : $"Cerrada {ClosedAt!.Value.ToLocalTime():dd/MM/yyyy HH:mm}";
}

public sealed record RecordLocalRastraComponentChange(
    Guid ClientChangeId,
    Guid InstallationId,
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    Guid ActorProfileId,
    Guid LineId,
    Guid RastraId,
    RastraComponentChangeType ChangeType,
    DateTimeOffset OccurredAt,
    DateTimeOffset RecordedAt,
    Guid? ReplacedInstallationId = null,
    Guid? InventoryItemId = null,
    decimal? Quantity = null,
    Guid? ResponsibleWorkerId = null,
    string? ComponentIdentifier = null,
    string? InstalledCondition = null,
    string? RemovedCondition = null,
    string? Reason = null,
    string? InstallationNotes = null,
    string? RemovalNotes = null,
    OutboxAuthorizationEvidence? Authorization = null);

public sealed record RecordLocalOperationalNoveltyChange(
    Guid ClientChangeId,
    Guid NoveltyId,
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    Guid ActorProfileId,
    OperationalNoveltyChangeType ChangeType,
    DateTimeOffset OccurredAt,
    DateTimeOffset RecordedAt,
    Guid? LineId = null,
    Guid? CategoryId = null,
    string? Description = null,
    Guid? ResponsibleWorkerId = null,
    OutboxAuthorizationEvidence? Authorization = null);

public sealed record LocalMaintenanceRegistration(
    Guid ClientChangeId,
    long ClientSequence,
    bool WasDuplicate);

public interface ILocalInventoryMaintenanceRepository
{
    Task<IReadOnlyList<LocalRastra>> ListRastrasAsync(
        Guid organizationId,
        Guid plantId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LocalRastraInstallation>> ListActiveInstallationsAsync(
        Guid organizationId,
        Guid plantId,
        Guid rastraId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<OperationalNoveltyCategory>> ListNoveltyCategoriesAsync(
        Guid organizationId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LocalOperationalNovelty>> ListNoveltiesAsync(
        Guid organizationId,
        Guid plantId,
        CancellationToken cancellationToken = default);

    Task<LocalMaintenanceRegistration> RecordComponentChangeAsync(
        RecordLocalRastraComponentChange mutation,
        CancellationToken cancellationToken = default);

    Task<LocalMaintenanceRegistration> RecordNoveltyChangeAsync(
        RecordLocalOperationalNoveltyChange mutation,
        CancellationToken cancellationToken = default);
}
