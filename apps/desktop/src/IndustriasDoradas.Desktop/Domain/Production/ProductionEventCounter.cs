namespace IndustriasDoradas.Desktop.Domain.Production;

public static class ProductionEventCounter
{
    public static int ForLineAndShipment(
        IEnumerable<ProductionEvent> events,
        Guid lineId,
        Guid shipmentId)
    {
        ArgumentNullException.ThrowIfNull(events);
        Require(lineId, nameof(lineId), "La línea es obligatoria para calcular el contador.");
        Require(shipmentId, nameof(shipmentId), "El cargamento es obligatorio para calcular el contador.");

        Dictionary<Guid, ProductionEvent> uniqueEvents = Deduplicate(events);
        Dictionary<Guid, ProductionEvent> additions = uniqueEvents.Values
            .Where(productionEvent =>
                productionEvent.Type == ProductionEventType.CajuelaAdded &&
                productionEvent.Context.LineId == lineId &&
                productionEvent.Context.ShipmentId == shipmentId)
            .ToDictionary(productionEvent => productionEvent.ClientEventId);

        var reversedAdditions = new HashSet<Guid>();
        foreach (ProductionEvent reversal in uniqueEvents.Values.Where(
                     productionEvent => productionEvent.Type == ProductionEventType.CajuelaReversed))
        {
            Guid reversedId = reversal.ReversesClientEventId!.Value;
            bool reversalClaimsScope =
                reversal.Context.LineId == lineId && reversal.Context.ShipmentId == shipmentId;
            bool targetsScope = additions.TryGetValue(reversedId, out ProductionEvent? addition);

            if (!reversalClaimsScope && !targetsScope)
            {
                continue;
            }

            if (addition is null)
            {
                throw new InvalidOperationException(
                    "La reversión referencia una cajuela que no existe en la línea y cargamento consultados.");
            }

            EnsureSameProductionScope(addition, reversal);

            if (!reversedAdditions.Add(reversedId))
            {
                throw new InvalidOperationException("Una cajuela no puede revertirse más de una vez.");
            }
        }

        return checked(additions.Count - reversedAdditions.Count);
    }

    private static Dictionary<Guid, ProductionEvent> Deduplicate(
        IEnumerable<ProductionEvent> events)
    {
        var unique = new Dictionary<Guid, ProductionEvent>();
        var stationSequences = new Dictionary<(Guid StationId, long Sequence), Guid>();
        foreach (ProductionEvent productionEvent in events)
        {
            ArgumentNullException.ThrowIfNull(productionEvent);

            if (unique.TryGetValue(productionEvent.ClientEventId, out ProductionEvent? existing))
            {
                if (existing != productionEvent)
                {
                    throw new InvalidOperationException(
                        "El mismo UUID cliente no puede identificar contenidos diferentes.");
                }

                continue;
            }

            var sequenceKey = (productionEvent.Context.StationId, productionEvent.ClientSequence);
            if (stationSequences.TryGetValue(sequenceKey, out Guid existingEventId) &&
                existingEventId != productionEvent.ClientEventId)
            {
                throw new InvalidOperationException(
                    "Una estación no puede usar la misma secuencia para eventos diferentes.");
            }

            unique.Add(productionEvent.ClientEventId, productionEvent);
            stationSequences.Add(sequenceKey, productionEvent.ClientEventId);
        }

        return unique;
    }

    private static void EnsureSameProductionScope(
        ProductionEvent addition,
        ProductionEvent reversal)
    {
        ProductionEventContext original = addition.Context;
        ProductionEventContext compensation = reversal.Context;
        if (original.OrganizationId != compensation.OrganizationId ||
            original.PlantId != compensation.PlantId ||
            original.LineId != compensation.LineId ||
            original.FeedCycleId != compensation.FeedCycleId ||
            original.ShipmentId != compensation.ShipmentId)
        {
            throw new InvalidOperationException(
                "La reversión debe conservar organización, planta, línea, ciclo y cargamento del evento original.");
        }
    }

    private static void Require(Guid value, string parameterName, string message)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException(message, parameterName);
        }
    }
}
