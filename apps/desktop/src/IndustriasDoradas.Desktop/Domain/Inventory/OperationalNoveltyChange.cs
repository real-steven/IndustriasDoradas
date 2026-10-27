namespace IndustriasDoradas.Desktop.Domain.Inventory;

public sealed record OperationalNoveltyCategory
{
    private OperationalNoveltyCategory(Guid id, string code, string name, bool isActive)
    {
        Id = InventoryItemType.Require(id, nameof(id));
        Code = InventoryItemType.RequireText(code, nameof(code))
            .Replace(' ', '_')
            .ToUpperInvariant();
        Name = InventoryItemType.RequireText(name, nameof(name));
        IsActive = isActive;
    }

    public Guid Id { get; }
    public string Code { get; }
    public string Name { get; }
    public bool IsActive { get; }

    public static OperationalNoveltyCategory Create(
        Guid id,
        string code,
        string name,
        bool isActive = true) =>
        new(id, code, name, isActive);
}

public enum OperationalNoveltyChangeType
{
    Opening,
    Closure,
}

public sealed record OperationalNoveltyChange
{
    private OperationalNoveltyChange(
        Guid clientChangeId,
        Guid noveltyId,
        PlantRecordContext context,
        OperationalNoveltyChangeType type,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        Guid? lineId,
        OperationalNoveltyCategory? category,
        string? description)
    {
        ArgumentNullException.ThrowIfNull(context);
        ClientChangeId = InventoryItemType.Require(clientChangeId, nameof(clientChangeId));
        NoveltyId = InventoryItemType.Require(noveltyId, nameof(noveltyId));
        if (lineId == Guid.Empty)
        {
            throw new ArgumentException("La línea no puede usar un identificador vacío.", nameof(lineId));
        }

        DateTimeOffset normalizedOccurredAt = occurredAt.ToUniversalTime();
        DateTimeOffset normalizedRecordedAt = recordedAt.ToUniversalTime();
        if (normalizedRecordedAt < normalizedOccurredAt)
        {
            throw new ArgumentOutOfRangeException(
                nameof(recordedAt),
                "El registro de la novedad no puede anteceder al hecho físico.");
        }

        string? normalizedDescription = string.IsNullOrWhiteSpace(description)
            ? null
            : description.Trim();
        if (type == OperationalNoveltyChangeType.Opening)
        {
            if (normalizedDescription is null)
            {
                throw new ArgumentException(
                    "La descripción de la novedad es obligatoria.",
                    nameof(description));
            }

            if (category is { IsActive: false })
            {
                throw new InvalidOperationException(
                    "Una novedad nueva no puede usar una categoría inactiva.");
            }
        }
        else if (lineId.HasValue || category is not null || normalizedDescription is not null)
        {
            throw new ArgumentException(
                "El cierre conserva el alcance, categoría y descripción de la apertura.",
                nameof(description));
        }

        Context = context;
        Type = type;
        OccurredAt = normalizedOccurredAt;
        RecordedAt = normalizedRecordedAt;
        LineId = lineId;
        CategoryId = category?.Id;
        CategoryCode = category?.Code;
        CategoryName = category?.Name;
        Description = normalizedDescription;
    }
    public Guid ClientChangeId { get; }
    public Guid NoveltyId { get; }
    public PlantRecordContext Context { get; }
    public OperationalNoveltyChangeType Type { get; }
    public DateTimeOffset OccurredAt { get; }
    public DateTimeOffset RecordedAt { get; }
    public Guid? LineId { get; }
    public Guid? CategoryId { get; }
    public string? CategoryCode { get; }
    public string? CategoryName { get; }
    public string? Description { get; }
    public static OperationalNoveltyChange Open(
        Guid clientChangeId,
        Guid noveltyId,
        PlantRecordContext context,
        DateTimeOffset startedAt,
        DateTimeOffset recordedAt,
        string description,
        Guid? lineId = null,
        OperationalNoveltyCategory? category = null) =>
        new(
            clientChangeId, noveltyId, context, OperationalNoveltyChangeType.Opening,
            startedAt, recordedAt, lineId, category, description);

    public static OperationalNoveltyChange Close(
        Guid clientChangeId,
        Guid noveltyId,
        PlantRecordContext context,
        DateTimeOffset endedAt,
        DateTimeOffset recordedAt) =>
        new(
            clientChangeId, noveltyId, context, OperationalNoveltyChangeType.Closure,
            endedAt, recordedAt, null, null, null);
}
