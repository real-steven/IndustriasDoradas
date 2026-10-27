namespace IndustriasDoradas.Desktop.Domain.Inventory;

public sealed record PlantRecordContext
{
    private PlantRecordContext(
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
                "Un registro de estación requiere estación y secuencia; un registro web no usa ninguna.",
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

    public static PlantRecordContext ForStation(
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

    public static PlantRecordContext ForManagement(
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
