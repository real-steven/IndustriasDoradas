namespace IndustriasDoradas.Desktop.Domain.Inventory;

public sealed record InventoryLedgerSnapshot(
    Guid InventoryItemId,
    string UnitCode,
    decimal Balance,
    IReadOnlyList<InventoryMovement> Movements,
    IReadOnlySet<Guid> ReversedMovementIds);

public static class InventoryLedger
{
    public static InventoryLedgerSnapshot Project(
        InventoryItem item,
        IEnumerable<InventoryMovement> source)
    {
        ArgumentNullException.ThrowIfNull(item);
        ArgumentNullException.ThrowIfNull(source);

        System.Collections.ObjectModel.ReadOnlyCollection<InventoryMovement> movements = Normalize(source);
        var applied = new Dictionary<Guid, InventoryMovement>();
        var reversed = new HashSet<Guid>();
        var returnedByExit = new Dictionary<Guid, decimal>();
        decimal balance = 0m;

        foreach (InventoryMovement movement in movements)
        {
            EnsureScope(item, movement);
            if (movement.Type == InventoryMovementType.Return &&
                movement.RelatedMovementId is Guid relatedExitId)
            {
                ValidateReturn(movement, relatedExitId, applied, reversed, returnedByExit);
            }

            if (movement.Type == InventoryMovementType.Reversal)
            {
                ValidateReversal(movement, applied, reversed, returnedByExit);
                reversed.Add(movement.RelatedMovementId!.Value);
            }

            decimal nextBalance = balance + movement.QuantityDelta;
            if (nextBalance < 0m)
            {
                throw new InvalidOperationException(
                    $"La cantidad solicitada {movement.Quantity} {item.Unit.Name} excede " +
                    $"la existencia disponible de {balance} {item.Unit.Name}.");
            }

            balance = nextBalance;
            applied.Add(movement.ClientMovementId, movement);
        }

        return new InventoryLedgerSnapshot(
            item.Id,
            item.Unit.Code,
            balance,
            movements,
            reversed);
    }

    private static System.Collections.ObjectModel.ReadOnlyCollection<InventoryMovement> Normalize(
        IEnumerable<InventoryMovement> source)
    {
        var unique = new Dictionary<Guid, InventoryMovement>();
        var stationSequences = new Dictionary<(Guid StationId, long Sequence), Guid>();
        var ordered = new List<InventoryMovement>();

        foreach (InventoryMovement movement in source)
        {
            ArgumentNullException.ThrowIfNull(movement);
            if (unique.TryGetValue(movement.ClientMovementId, out InventoryMovement? existing))
            {
                if (existing != movement)
                {
                    throw new InvalidOperationException(
                        "El mismo UUID de inventario no puede identificar contenidos diferentes.");
                }

                continue;
            }

            if (movement.Context.StationId is Guid stationId &&
                movement.Context.ClientSequence is long sequence)
            {
                var key = (stationId, sequence);
                if (stationSequences.TryGetValue(key, out Guid existingMovementId) &&
                    existingMovementId != movement.ClientMovementId)
                {
                    throw new InvalidOperationException(
                        "Una estación no puede reutilizar la misma secuencia de inventario.");
                }

                stationSequences.Add(key, movement.ClientMovementId);
            }

            unique.Add(movement.ClientMovementId, movement);
            ordered.Add(movement);
        }

        return ordered.AsReadOnly();
    }

    private static void EnsureScope(InventoryItem item, InventoryMovement movement)
    {
        if (movement.InventoryItemId != item.Id ||
            movement.Context.OrganizationId != item.OrganizationId ||
            movement.Context.PlantId != item.PlantId ||
            movement.UnitCode != item.Unit.Code)
        {
            throw new InvalidOperationException(
                "El kardex no puede mezclar artículos, unidades, plantas u organizaciones.");
        }
    }

    private static void ValidateReturn(
        InventoryMovement movement,
        Guid relatedExitId,
        Dictionary<Guid, InventoryMovement> applied,
        HashSet<Guid> reversed,
        Dictionary<Guid, decimal> returnedByExit)
    {
        if (!applied.TryGetValue(relatedExitId, out InventoryMovement? related) ||
            related.Type != InventoryMovementType.Exit)
        {
            throw new InvalidOperationException(
                "El reintegro relacionado debe referenciar una salida anterior del mismo artículo.");
        }

        if (reversed.Contains(relatedExitId))
        {
            throw new InvalidOperationException("No se puede reintegrar una salida que ya fue revertida.");
        }

        decimal returned = returnedByExit.GetValueOrDefault(relatedExitId) + movement.Quantity;
        if (returned > related.Quantity)
        {
            throw new InvalidOperationException(
                "Los reintegros relacionados no pueden superar la cantidad de la salida original.");
        }

        returnedByExit[relatedExitId] = returned;
    }

    private static void ValidateReversal(
        InventoryMovement movement,
        Dictionary<Guid, InventoryMovement> applied,
        HashSet<Guid> reversed,
        Dictionary<Guid, decimal> returnedByExit)
    {
        Guid targetId = movement.RelatedMovementId!.Value;
        if (!applied.TryGetValue(targetId, out InventoryMovement? target))
        {
            throw new InvalidOperationException(
                "El reverso debe referenciar un movimiento anterior del mismo kardex.");
        }

        if (target.Type == InventoryMovementType.Reversal)
        {
            throw new InvalidOperationException("Un reverso no puede compensar otro reverso.");
        }

        if (reversed.Contains(targetId))
        {
            throw new InvalidOperationException("Un movimiento no puede revertirse más de una vez.");
        }

        if (returnedByExit.GetValueOrDefault(targetId) > 0m)
        {
            throw new InvalidOperationException(
                "Una salida con reintegros relacionados no puede revertirse completa.");
        }

        if (movement.QuantityDelta != -target.QuantityDelta)
        {
            throw new InvalidOperationException(
                "El reverso debe compensar exactamente la cantidad del movimiento original.");
        }
    }
}
