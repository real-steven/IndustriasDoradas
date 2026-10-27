namespace IndustriasDoradas.Desktop.Domain.Inventory;

public enum RastraComponentChangeType
{
    Installation,
    Removal,
    Replacement,
}

public sealed record RastraComponentChange
{
    private RastraComponentChange(
        Guid clientChangeId,
        Guid installationId,
        PlantRecordContext context,
        Guid rastraId,
        RastraComponentChangeType type,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        InventoryItem? item,
        decimal? quantity,
        string? componentIdentifier,
        string? installedCondition,
        string? removedCondition,
        string? reason,
        string? installationNotes,
        string? removalNotes,
        Guid? replacedInstallationId)
    {
        ArgumentNullException.ThrowIfNull(context);
        ClientChangeId = InventoryItemType.Require(clientChangeId, nameof(clientChangeId));
        InstallationId = InventoryItemType.Require(installationId, nameof(installationId));
        RastraId = InventoryItemType.Require(rastraId, nameof(rastraId));

        DateTimeOffset normalizedOccurredAt = occurredAt.ToUniversalTime();
        DateTimeOffset normalizedRecordedAt = recordedAt.ToUniversalTime();
        if (normalizedRecordedAt < normalizedOccurredAt)
        {
            throw new ArgumentOutOfRangeException(
                nameof(recordedAt),
                "El registro del componente no puede anteceder al hecho físico.");
        }

        if (type is RastraComponentChangeType.Installation or RastraComponentChangeType.Replacement)
        {
            ArgumentNullException.ThrowIfNull(item);
            EnsureSameScope(context, item);
            if (!item.IsActive || !item.Type.IsActive)
            {
                throw new InvalidOperationException(
                    "Solo un artículo y tipo activos pueden iniciar una instalación.");
            }

            if (!quantity.HasValue)
            {
                throw new ArgumentException("La cantidad instalada es obligatoria.", nameof(quantity));
            }

            item.Unit.EnsureValidQuantity(quantity.Value, nameof(quantity));
        }
        if (type != RastraComponentChangeType.Replacement && replacedInstallationId.HasValue)
        {
            throw new ArgumentException(
                "Solo un reemplazo puede referenciar la instalación anterior.",
                nameof(replacedInstallationId));
        }

        if (type == RastraComponentChangeType.Replacement)
        {
            Guid replacedId = InventoryItemType.Require(
                replacedInstallationId ?? Guid.Empty,
                nameof(replacedInstallationId));
            if (replacedId == installationId)
            {
                throw new ArgumentException(
                    "El reemplazo debe crear una instalación diferente.",
                    nameof(installationId));
            }
        }
        string? normalizedInstalledCondition = NormalizeOptional(installedCondition);
        string? normalizedRemovedCondition = NormalizeOptional(removedCondition);
        string? normalizedReason = NormalizeOptional(reason);
        if (type is RastraComponentChangeType.Installation or RastraComponentChangeType.Replacement &&
            normalizedInstalledCondition is null)
        {
            throw new ArgumentException(
                "La condición al instalar es obligatoria.",
                nameof(installedCondition));
        }

        if (type is RastraComponentChangeType.Removal or RastraComponentChangeType.Replacement &&
            normalizedRemovedCondition is null)
        {
            throw new ArgumentException(
                "La condición al retirar es obligatoria.",
                nameof(removedCondition));
        }

        if (type is RastraComponentChangeType.Removal or RastraComponentChangeType.Replacement &&
            normalizedReason is null)
        {
            throw new ArgumentException(
                "El retiro o reemplazo requiere un motivo.",
                nameof(reason));
        }
        Context = context;
        Type = type;
        OccurredAt = normalizedOccurredAt;
        RecordedAt = normalizedRecordedAt;
        InventoryItemId = item?.Id;
        InventoryItemTypeCode = item?.Type.Code;
        InventoryItemName = item?.Name;
        UnitCode = item?.Unit.Code;
        Quantity = quantity;
        ComponentIdentifier = NormalizeOptional(componentIdentifier);
        InstalledCondition = normalizedInstalledCondition;
        RemovedCondition = normalizedRemovedCondition;
        Reason = normalizedReason;
        InstallationNotes = NormalizeOptional(installationNotes);
        RemovalNotes = NormalizeOptional(removalNotes);
        ReplacedInstallationId = replacedInstallationId;
    }

    public Guid ClientChangeId { get; }
    public Guid InstallationId { get; }
    public PlantRecordContext Context { get; }
    public Guid RastraId { get; }
    public RastraComponentChangeType Type { get; }
    public DateTimeOffset OccurredAt { get; }
    public DateTimeOffset RecordedAt { get; }
    public Guid? InventoryItemId { get; }
    public string? InventoryItemTypeCode { get; }
    public string? InventoryItemName { get; }
    public string? UnitCode { get; }
    public decimal? Quantity { get; }
    public string? ComponentIdentifier { get; }
    public string? InstalledCondition { get; }
    public string? RemovedCondition { get; }
    public string? Reason { get; }
    public string? InstallationNotes { get; }
    public string? RemovalNotes { get; }
    public Guid? ReplacedInstallationId { get; }
    public static RastraComponentChange Install(
        Guid clientChangeId,
        Guid installationId,
        PlantRecordContext context,
        Guid rastraId,
        InventoryItem item,
        decimal quantity,
        DateTimeOffset installedAt,
        DateTimeOffset recordedAt,
        string condition,
        string? componentIdentifier = null,
        string? notes = null) =>
        new(
            clientChangeId, installationId, context, rastraId,
            RastraComponentChangeType.Installation, installedAt, recordedAt,
            item, quantity, componentIdentifier, condition, null, null, notes, null, null);

    public static RastraComponentChange Remove(
        Guid clientChangeId,
        Guid installationId,
        PlantRecordContext context,
        Guid rastraId,
        DateTimeOffset removedAt,
        DateTimeOffset recordedAt,
        string condition,
        string reason,
        string? notes = null) =>
        new(
            clientChangeId, installationId, context, rastraId,
            RastraComponentChangeType.Removal, removedAt, recordedAt,
            null, null, null, null, condition, reason, null, notes, null);
    public static RastraComponentChange Replace(
        Guid clientChangeId,
        Guid newInstallationId,
        Guid replacedInstallationId,
        PlantRecordContext context,
        Guid rastraId,
        InventoryItem replacementItem,
        decimal quantity,
        DateTimeOffset replacedAt,
        DateTimeOffset recordedAt,
        string removedCondition,
        string installedCondition,
        string reason,
        string? componentIdentifier = null,
        string? removalNotes = null,
        string? installationNotes = null) =>
        new(
            clientChangeId, newInstallationId, context, rastraId,
            RastraComponentChangeType.Replacement, replacedAt, recordedAt,
            replacementItem, quantity, componentIdentifier, installedCondition,
            removedCondition, reason, installationNotes, removalNotes, replacedInstallationId);

    private static void EnsureSameScope(PlantRecordContext context, InventoryItem item)
    {
        if (context.OrganizationId != item.OrganizationId || context.PlantId != item.PlantId)
        {
            throw new ArgumentException(
                "El artículo instalado debe pertenecer a la organización y planta del registro.",
                nameof(item));
        }
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
