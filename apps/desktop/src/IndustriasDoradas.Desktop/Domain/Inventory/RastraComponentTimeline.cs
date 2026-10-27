using System.Collections.ObjectModel;

namespace IndustriasDoradas.Desktop.Domain.Inventory;

public sealed record RastraComponentTimelineEntry
{
    private RastraComponentTimelineEntry(
        Guid installationId,
        Guid organizationId,
        Guid plantId,
        Guid rastraId,
        Guid inventoryItemId,
        string inventoryItemTypeCode,
        string inventoryItemName,
        string unitCode,
        decimal quantity,
        string? componentIdentifier,
        string installedCondition,
        DateTimeOffset installedAt,
        Guid installedByProfileId,
        Guid? installationResponsibleWorkerId,
        string? installationNotes,
        Guid? replacesInstallationId,
        DateTimeOffset? removedAt = null,
        string? removedCondition = null,
        Guid? removedByProfileId = null,
        Guid? removalResponsibleWorkerId = null,
        string? removalReason = null,
        string? removalNotes = null,
        Guid? replacedByInstallationId = null)
    {
        InstallationId = installationId;
        OrganizationId = organizationId;
        PlantId = plantId;
        RastraId = rastraId;
        InventoryItemId = inventoryItemId;
        InventoryItemTypeCode = inventoryItemTypeCode;
        InventoryItemName = inventoryItemName;
        UnitCode = unitCode;
        Quantity = quantity;
        ComponentIdentifier = componentIdentifier;
        InstalledCondition = installedCondition;
        InstalledAt = installedAt;
        InstalledByProfileId = installedByProfileId;
        InstallationResponsibleWorkerId = installationResponsibleWorkerId;
        InstallationNotes = installationNotes;
        ReplacesInstallationId = replacesInstallationId;
        RemovedAt = removedAt;
        RemovedCondition = removedCondition;
        RemovedByProfileId = removedByProfileId;
        RemovalResponsibleWorkerId = removalResponsibleWorkerId;
        RemovalReason = removalReason;
        RemovalNotes = removalNotes;
        ReplacedByInstallationId = replacedByInstallationId;
    }

    public Guid InstallationId { get; }
    public Guid OrganizationId { get; }
    public Guid PlantId { get; }
    public Guid RastraId { get; }
    public Guid InventoryItemId { get; }
    public string InventoryItemTypeCode { get; }
    public string InventoryItemName { get; }
    public string UnitCode { get; }
    public decimal Quantity { get; }
    public string? ComponentIdentifier { get; }
    public string InstalledCondition { get; }
    public DateTimeOffset InstalledAt { get; }
    public Guid InstalledByProfileId { get; }
    public Guid? InstallationResponsibleWorkerId { get; }
    public string? InstallationNotes { get; }
    public Guid? ReplacesInstallationId { get; }
    public DateTimeOffset? RemovedAt { get; }
    public string? RemovedCondition { get; }
    public Guid? RemovedByProfileId { get; }
    public Guid? RemovalResponsibleWorkerId { get; }
    public string? RemovalReason { get; }
    public string? RemovalNotes { get; }
    public Guid? ReplacedByInstallationId { get; }
    public bool IsActive => RemovedAt is null;
    public TimeSpan? Lifetime => RemovedAt - InstalledAt;
    internal static RastraComponentTimelineEntry Open(RastraComponentChange change) =>
        new(
            change.InstallationId,
            change.Context.OrganizationId,
            change.Context.PlantId,
            change.RastraId,
            change.InventoryItemId!.Value,
            change.InventoryItemTypeCode!,
            change.InventoryItemName!,
            change.UnitCode!,
            change.Quantity!.Value,
            change.ComponentIdentifier,
            change.InstalledCondition!,
            change.OccurredAt,
            change.Context.ActorProfileId,
            change.Context.ResponsibleWorkerId,
            change.InstallationNotes,
            change.ReplacedInstallationId);

    internal RastraComponentTimelineEntry Close(
        RastraComponentChange change,
        Guid? replacedByInstallationId = null) =>
        new(
            InstallationId,
            OrganizationId,
            PlantId,
            RastraId,
            InventoryItemId,
            InventoryItemTypeCode,
            InventoryItemName,
            UnitCode,
            Quantity,
            ComponentIdentifier,
            InstalledCondition,
            InstalledAt,
            InstalledByProfileId,
            InstallationResponsibleWorkerId,
            InstallationNotes,
            ReplacesInstallationId,
            change.OccurredAt,
            change.RemovedCondition,
            change.Context.ActorProfileId,
            change.Context.ResponsibleWorkerId,
            change.Reason,
            change.RemovalNotes,
            replacedByInstallationId);
}

public sealed record RastraComponentTimelineSnapshot(
    Guid OrganizationId,
    Guid PlantId,
    Guid RastraId,
    IReadOnlyList<RastraComponentTimelineEntry> Entries,
    IReadOnlyList<RastraComponentChange> Changes)
{
    public IReadOnlyList<RastraComponentTimelineEntry> ActiveInstallations =>
        Array.AsReadOnly(Entries.Where(entry => entry.IsActive).ToArray());
}

public static class RastraComponentTimeline
{
    public static RastraComponentTimelineSnapshot Project(
        Guid organizationId,
        Guid plantId,
        Guid rastraId,
        IEnumerable<RastraComponentChange> changes)
    {
        InventoryItemType.Require(organizationId, nameof(organizationId));
        InventoryItemType.Require(plantId, nameof(plantId));
        InventoryItemType.Require(rastraId, nameof(rastraId));
        ArgumentNullException.ThrowIfNull(changes);

        IReadOnlyList<RastraComponentChange> uniqueChanges = DistinctChanges(changes);
        var entries = new Dictionary<Guid, RastraComponentTimelineEntry>();
        foreach (RastraComponentChange change in uniqueChanges)
        {
            if (change.Context.OrganizationId != organizationId ||
                change.Context.PlantId != plantId ||
                change.RastraId != rastraId)
            {
                throw new InvalidOperationException(
                    "Una línea temporal no puede mezclar organizaciones, plantas o rastras.");
            }

            Apply(entries, change);
        }

        RastraComponentTimelineEntry[] timeline = [.. entries.Values
            .OrderBy(entry => entry.InstalledAt)
            .ThenBy(entry => entry.InstallationId)];
        return new(
            organizationId,
            plantId,
            rastraId,
            Array.AsReadOnly(timeline),
            uniqueChanges);
    }

    private static ReadOnlyCollection<RastraComponentChange> DistinctChanges(
        IEnumerable<RastraComponentChange> changes)
    {
        var unique = new Dictionary<Guid, RastraComponentChange>();
        var ordered = new List<RastraComponentChange>();
        var stationSequences = new Dictionary<(Guid StationId, long Sequence), Guid>();

        foreach (RastraComponentChange change in changes)
        {
            ArgumentNullException.ThrowIfNull(change);
            if (unique.TryGetValue(change.ClientChangeId, out RastraComponentChange? existing))
            {
                if (existing != change)
                {
                    throw new InvalidOperationException(
                        "El mismo UUID de componente no puede identificar contenidos diferentes.");
                }

                continue;
            }

            if (change.Context.StationId.HasValue)
            {
                var key = (change.Context.StationId.Value, change.Context.ClientSequence!.Value);
                if (stationSequences.TryGetValue(key, out Guid existingChangeId) &&
                    existingChangeId != change.ClientChangeId)
                {
                    throw new InvalidOperationException(
                        "Una estación no puede usar la misma secuencia para cambios diferentes.");
                }

                stationSequences.Add(key, change.ClientChangeId);
            }

            unique.Add(change.ClientChangeId, change);
            ordered.Add(change);
        }

        return Array.AsReadOnly(ordered.ToArray());
    }
    private static void Apply(
        Dictionary<Guid, RastraComponentTimelineEntry> entries,
        RastraComponentChange change)
    {
        if (change.Type == RastraComponentChangeType.Installation)
        {
            if (entries.ContainsKey(change.InstallationId))
            {
                throw new InvalidOperationException("La instalación del componente ya existe.");
            }

            entries.Add(change.InstallationId, RastraComponentTimelineEntry.Open(change));
            return;
        }

        Guid previousId = change.Type == RastraComponentChangeType.Replacement
            ? change.ReplacedInstallationId!.Value
            : change.InstallationId;
        RastraComponentTimelineEntry previous = RequireActive(entries, previousId);
        if (change.OccurredAt < previous.InstalledAt)
        {
            throw new InvalidOperationException(
                "Un componente no puede retirarse antes de su instalación.");
        }

        if (change.Type == RastraComponentChangeType.Removal)
        {
            entries[previousId] = previous.Close(change);
            return;
        }

        if (entries.ContainsKey(change.InstallationId))
        {
            throw new InvalidOperationException("La nueva instalación del reemplazo ya existe.");
        }

        entries[previousId] = previous.Close(change, change.InstallationId);
        entries.Add(change.InstallationId, RastraComponentTimelineEntry.Open(change));
    }

    private static RastraComponentTimelineEntry RequireActive(
        Dictionary<Guid, RastraComponentTimelineEntry> entries,
        Guid installationId)
    {
        if (!entries.TryGetValue(installationId, out RastraComponentTimelineEntry? current))
        {
            throw new InvalidOperationException("La instalación que se intenta cerrar no existe.");
        }

        if (!current.IsActive)
        {
            throw new InvalidOperationException("La instalación ya fue retirada o reemplazada.");
        }

        return current;
    }
}
