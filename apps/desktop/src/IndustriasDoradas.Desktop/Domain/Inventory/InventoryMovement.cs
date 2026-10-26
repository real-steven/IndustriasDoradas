namespace IndustriasDoradas.Desktop.Domain.Inventory;

public enum InventoryMovementType
{
    Entry,
    Exit,
    Consumption,
    Return,
    Adjustment,
    Reversal,
}

public sealed record InventoryMovementContext
{
    private InventoryMovementContext(
        Guid organizationId,
        Guid plantId,
        Guid actorProfileId,
        Guid? stationId,
        long? clientSequence,
        Guid? responsibleWorkerId)
    {
        OrganizationId = InventoryItemType.Require(organizationId, nameof(organizationId));
        PlantId = InventoryItemType.Require(plantId, nameof(plantId));
        ActorProfileId = InventoryItemType.Require(actorProfileId, nameof(actorProfileId));

        if (stationId == Guid.Empty)
        {
            throw new ArgumentException("La estación no puede usar un identificador vacío.", nameof(stationId));
        }

        if (responsibleWorkerId == Guid.Empty)
        {
            throw new ArgumentException(
                "El trabajador responsable no puede usar un identificador vacío.",
                nameof(responsibleWorkerId));
        }

        if (stationId.HasValue != clientSequence.HasValue)
        {
            throw new ArgumentException(
                "Una mutación de estación requiere estación y secuencia; una mutación web no usa ninguna.",
                nameof(clientSequence));
        }

        if (clientSequence <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(clientSequence),
                "La secuencia de estación debe ser mayor que cero.");
        }

        StationId = stationId;
        ClientSequence = clientSequence;
        ResponsibleWorkerId = responsibleWorkerId;
    }

    public Guid OrganizationId { get; }

    public Guid PlantId { get; }

    public Guid ActorProfileId { get; }

    public Guid? StationId { get; }

    public long? ClientSequence { get; }

    public Guid? ResponsibleWorkerId { get; }

    public static InventoryMovementContext ForStation(
        Guid organizationId,
        Guid plantId,
        Guid stationId,
        long clientSequence,
        Guid actorProfileId,
        Guid? responsibleWorkerId = null) =>
        new(
            organizationId,
            plantId,
            actorProfileId,
            stationId,
            clientSequence,
            responsibleWorkerId);

    public static InventoryMovementContext ForManagement(
        Guid organizationId,
        Guid plantId,
        Guid actorProfileId,
        Guid? responsibleWorkerId = null) =>
        new(
            organizationId,
            plantId,
            actorProfileId,
            null,
            null,
            responsibleWorkerId);
}

public sealed record InventoryMovement
{
    private InventoryMovement(
        Guid clientMovementId,
        InventoryMovementContext context,
        InventoryItem item,
        InventoryMovementType type,
        decimal quantityDelta,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        string? reason,
        string? destination,
        string? notes,
        Guid? relatedMovementId)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(item);
        ClientMovementId = InventoryItemType.Require(clientMovementId, nameof(clientMovementId));
        EnsureSameScope(context, item);
        item.Unit.EnsureValidQuantity(quantityDelta, nameof(quantityDelta));
        ValidateDirection(type, quantityDelta);
        ValidateRelation(type, relatedMovementId);

        string? normalizedReason = NormalizeOptional(reason);
        if (type is InventoryMovementType.Adjustment or InventoryMovementType.Reversal &&
            normalizedReason is null)
        {
            throw new ArgumentException(
                "Un ajuste o reverso requiere un motivo.",
                nameof(reason));
        }

        Context = context;
        InventoryItemId = item.Id;
        UnitCode = item.Unit.Code;
        Type = type;
        QuantityDelta = quantityDelta;
        OccurredAt = occurredAt.ToUniversalTime();
        RecordedAt = recordedAt.ToUniversalTime();
        Reason = normalizedReason;
        Destination = NormalizeOptional(destination);
        Notes = NormalizeOptional(notes);
        RelatedMovementId = relatedMovementId;
    }

    public Guid ClientMovementId { get; }

    public InventoryMovementContext Context { get; }

    public Guid InventoryItemId { get; }

    public string UnitCode { get; }

    public InventoryMovementType Type { get; }

    public decimal QuantityDelta { get; }

    public decimal Quantity => Math.Abs(QuantityDelta);

    public DateTimeOffset OccurredAt { get; }

    public DateTimeOffset RecordedAt { get; }

    public string? Reason { get; }

    public string? Destination { get; }

    public string? Notes { get; }

    public Guid? RelatedMovementId { get; }

    public static InventoryMovement Entry(
        Guid id,
        InventoryMovementContext context,
        InventoryItem item,
        decimal quantity,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        string? destination = null,
        string? notes = null) =>
        CreateOrdinary(
            id,
            context,
            item,
            InventoryMovementType.Entry,
            quantity,
            occurredAt,
            recordedAt,
            destination,
            notes);

    public static InventoryMovement Exit(
        Guid id,
        InventoryMovementContext context,
        InventoryItem item,
        decimal quantity,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        string? destination = null,
        string? notes = null) =>
        CreateOrdinary(
            id,
            context,
            item,
            InventoryMovementType.Exit,
            -quantity,
            occurredAt,
            recordedAt,
            destination,
            notes);

    public static InventoryMovement Consumption(
        Guid id,
        InventoryMovementContext context,
        InventoryItem item,
        decimal quantity,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        string? destination = null,
        string? notes = null) =>
        CreateOrdinary(
            id,
            context,
            item,
            InventoryMovementType.Consumption,
            -quantity,
            occurredAt,
            recordedAt,
            destination,
            notes);

    public static InventoryMovement Return(
        Guid id,
        InventoryMovementContext context,
        InventoryItem item,
        decimal quantity,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        Guid? relatedExitId = null,
        string? notes = null) =>
        new(
            id,
            context,
            item,
            InventoryMovementType.Return,
            quantity,
            occurredAt,
            recordedAt,
            null,
            null,
            notes,
            relatedExitId);

    public static InventoryMovement Adjustment(
        Guid id,
        InventoryMovementContext context,
        InventoryItem item,
        decimal quantityDelta,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        string reason,
        string? notes = null) =>
        new(
            id,
            context,
            item,
            InventoryMovementType.Adjustment,
            quantityDelta,
            occurredAt,
            recordedAt,
            reason,
            null,
            notes,
            null);

    public static InventoryMovement Reversal(
        Guid id,
        InventoryMovementContext context,
        InventoryItem item,
        InventoryMovement target,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        string reason,
        string? notes = null)
    {
        ArgumentNullException.ThrowIfNull(target);
        if (target.Type == InventoryMovementType.Reversal)
        {
            throw new ArgumentException("Un reverso no puede revertir otro reverso.", nameof(target));
        }

        if (target.InventoryItemId != item.Id)
        {
            throw new ArgumentException("El reverso debe usar el mismo artículo del movimiento original.", nameof(item));
        }

        return new(
            id,
            context,
            item,
            InventoryMovementType.Reversal,
            -target.QuantityDelta,
            occurredAt,
            recordedAt,
            reason,
            null,
            notes,
            target.ClientMovementId);
    }

    private static InventoryMovement CreateOrdinary(
        Guid id,
        InventoryMovementContext context,
        InventoryItem item,
        InventoryMovementType type,
        decimal quantityDelta,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        string? destination,
        string? notes) =>
        new(
            id,
            context,
            item,
            type,
            quantityDelta,
            occurredAt,
            recordedAt,
            null,
            destination,
            notes,
            null);

    private static void EnsureSameScope(InventoryMovementContext context, InventoryItem item)
    {
        if (context.OrganizationId != item.OrganizationId || context.PlantId != item.PlantId)
        {
            throw new ArgumentException(
                "El contexto y el artículo deben pertenecer a la misma organización y planta.",
                nameof(item));
        }
    }

    private static void ValidateDirection(InventoryMovementType type, decimal quantityDelta)
    {
        bool isPositive = quantityDelta > 0m;
        bool valid = type switch
        {
            InventoryMovementType.Entry or InventoryMovementType.Return => isPositive,
            InventoryMovementType.Exit or InventoryMovementType.Consumption => !isPositive,
            InventoryMovementType.Adjustment or InventoryMovementType.Reversal => quantityDelta != 0m,
            _ => false,
        };

        if (!valid)
        {
            throw new ArgumentOutOfRangeException(
                nameof(quantityDelta),
                "La dirección de la cantidad no coincide con el tipo de movimiento.");
        }
    }

    private static void ValidateRelation(InventoryMovementType type, Guid? relatedMovementId)
    {
        if (relatedMovementId == Guid.Empty)
        {
            throw new ArgumentException(
                "La relación no puede usar un identificador vacío.",
                nameof(relatedMovementId));
        }

        if (type == InventoryMovementType.Reversal && relatedMovementId is null)
        {
            throw new ArgumentException(
                "Un reverso debe indicar el movimiento que compensa.",
                nameof(relatedMovementId));
        }

        if (type is not InventoryMovementType.Return and not InventoryMovementType.Reversal &&
            relatedMovementId is not null)
        {
            throw new ArgumentException(
                "Solo un reintegro o reverso puede relacionarse con otro movimiento.",
                nameof(relatedMovementId));
        }
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
