namespace IndustriasDoradas.Desktop.Domain.Production;

public sealed record ProductionEventContext
{
    private ProductionEventContext(
        Guid organizationId,
        Guid plantId,
        Guid stationId,
        Guid lineId,
        Guid feedCycleId,
        Guid shipmentId,
        Guid responsibleWorkerId)
    {
        OrganizationId = Require(organizationId, nameof(organizationId), "La organización es obligatoria.");
        PlantId = Require(plantId, nameof(plantId), "La planta es obligatoria.");
        StationId = Require(stationId, nameof(stationId), "La estación es obligatoria.");
        LineId = Require(lineId, nameof(lineId), "La línea es obligatoria.");
        FeedCycleId = Require(feedCycleId, nameof(feedCycleId), "El ciclo es obligatorio.");
        ShipmentId = Require(shipmentId, nameof(shipmentId), "El cargamento es obligatorio.");
        ResponsibleWorkerId = Require(
            responsibleWorkerId,
            nameof(responsibleWorkerId),
            "El responsable asignado es obligatorio.");
    }

    public Guid OrganizationId { get; }

    public Guid PlantId { get; }

    public Guid StationId { get; }

    public Guid LineId { get; }

    public Guid FeedCycleId { get; }

    public Guid ShipmentId { get; }

    public Guid ResponsibleWorkerId { get; }

    public static ProductionEventContext Create(
        Guid organizationId,
        Guid plantId,
        Guid stationId,
        Guid lineId,
        Guid feedCycleId,
        Guid shipmentId,
        Guid responsibleWorkerId) =>
        new(
            organizationId,
            plantId,
            stationId,
            lineId,
            feedCycleId,
            shipmentId,
            responsibleWorkerId);

    private static Guid Require(Guid value, string parameterName, string message)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException(message, parameterName);
        }

        return value;
    }
}
