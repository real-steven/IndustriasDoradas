using System.Collections.ObjectModel;

namespace IndustriasDoradas.Desktop.Domain.Inventory;

public sealed record OperationalNoveltyTimelineEntry
{
    private OperationalNoveltyTimelineEntry(
        Guid noveltyId,
        Guid organizationId,
        Guid plantId,
        Guid? lineId,
        Guid? categoryId,
        string? categoryCode,
        string? categoryName,
        string description,
        DateTimeOffset startedAt,
        Guid openedByProfileId,
        Guid? openingResponsibleWorkerId,
        DateTimeOffset? endedAt = null,
        Guid? closedByProfileId = null,
        Guid? closureResponsibleWorkerId = null)
    {
        NoveltyId = noveltyId;
        OrganizationId = organizationId;
        PlantId = plantId;
        LineId = lineId;
        CategoryId = categoryId;
        CategoryCode = categoryCode;
        CategoryName = categoryName;
        Description = description;
        StartedAt = startedAt;
        OpenedByProfileId = openedByProfileId;
        OpeningResponsibleWorkerId = openingResponsibleWorkerId;
        EndedAt = endedAt;
        ClosedByProfileId = closedByProfileId;
        ClosureResponsibleWorkerId = closureResponsibleWorkerId;
    }

    public Guid NoveltyId { get; }
    public Guid OrganizationId { get; }
    public Guid PlantId { get; }
    public Guid? LineId { get; }
    public Guid? CategoryId { get; }
    public string? CategoryCode { get; }
    public string? CategoryName { get; }
    public string Description { get; }
    public DateTimeOffset StartedAt { get; }
    public Guid OpenedByProfileId { get; }
    public Guid? OpeningResponsibleWorkerId { get; }
    public DateTimeOffset? EndedAt { get; }
    public Guid? ClosedByProfileId { get; }
    public Guid? ClosureResponsibleWorkerId { get; }
    public bool IsOpen => EndedAt is null;
    public TimeSpan? Duration => EndedAt - StartedAt;

    public bool Covers(DateTimeOffset instant)
    {
        DateTimeOffset normalized = instant.ToUniversalTime();
        return normalized >= StartedAt && (!EndedAt.HasValue || normalized <= EndedAt.Value);
    }
    internal static OperationalNoveltyTimelineEntry Open(OperationalNoveltyChange change) =>
        new(
            change.NoveltyId,
            change.Context.OrganizationId,
            change.Context.PlantId,
            change.LineId,
            change.CategoryId,
            change.CategoryCode,
            change.CategoryName,
            change.Description!,
            change.OccurredAt,
            change.Context.ActorProfileId,
            change.Context.ResponsibleWorkerId);

    internal OperationalNoveltyTimelineEntry Close(OperationalNoveltyChange change) =>
        new(
            NoveltyId,
            OrganizationId,
            PlantId,
            LineId,
            CategoryId,
            CategoryCode,
            CategoryName,
            Description,
            StartedAt,
            OpenedByProfileId,
            OpeningResponsibleWorkerId,
            change.OccurredAt,
            change.Context.ActorProfileId,
            change.Context.ResponsibleWorkerId);
}

public sealed record OperationalNoveltyHistorySnapshot(
    Guid OrganizationId,
    Guid PlantId,
    IReadOnlyList<OperationalNoveltyTimelineEntry> Entries,
    IReadOnlyList<OperationalNoveltyChange> Changes)
{
    public IReadOnlyList<OperationalNoveltyTimelineEntry> OpenEntries =>
        Array.AsReadOnly(Entries.Where(entry => entry.IsOpen).ToArray());
}

public static class OperationalNoveltyHistory
{
    public static OperationalNoveltyHistorySnapshot Project(
        Guid organizationId,
        Guid plantId,
        IEnumerable<OperationalNoveltyChange> changes)
    {
        InventoryItemType.Require(organizationId, nameof(organizationId));
        InventoryItemType.Require(plantId, nameof(plantId));
        ArgumentNullException.ThrowIfNull(changes);

        IReadOnlyList<OperationalNoveltyChange> uniqueChanges = DistinctChanges(changes);
        var entries = new Dictionary<Guid, OperationalNoveltyTimelineEntry>();
        foreach (OperationalNoveltyChange change in uniqueChanges)
        {
            if (change.Context.OrganizationId != organizationId ||
                change.Context.PlantId != plantId)
            {
                throw new InvalidOperationException(
                    "Un historial de novedades no puede mezclar organizaciones o plantas.");
            }

            Apply(entries, change);
        }

        OperationalNoveltyTimelineEntry[] timeline = [.. entries.Values
            .OrderBy(entry => entry.StartedAt)
            .ThenBy(entry => entry.NoveltyId)];
        return new(
            organizationId,
            plantId,
            Array.AsReadOnly(timeline),
            uniqueChanges);
    }

    private static ReadOnlyCollection<OperationalNoveltyChange> DistinctChanges(
        IEnumerable<OperationalNoveltyChange> changes)
    {
        var unique = new Dictionary<Guid, OperationalNoveltyChange>();
        var ordered = new List<OperationalNoveltyChange>();
        var stationSequences = new Dictionary<(Guid StationId, long Sequence), Guid>();

        foreach (OperationalNoveltyChange change in changes)
        {
            ArgumentNullException.ThrowIfNull(change);
            if (unique.TryGetValue(change.ClientChangeId, out OperationalNoveltyChange? existing))
            {
                if (existing != change)
                {
                    throw new InvalidOperationException(
                        "El mismo UUID de novedad no puede identificar contenidos diferentes.");
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
                        "Una estación no puede usar la misma secuencia para novedades diferentes.");
                }

                stationSequences.Add(key, change.ClientChangeId);
            }

            unique.Add(change.ClientChangeId, change);
            ordered.Add(change);
        }

        return Array.AsReadOnly(ordered.ToArray());
    }
    private static void Apply(
        Dictionary<Guid, OperationalNoveltyTimelineEntry> entries,
        OperationalNoveltyChange change)
    {
        if (change.Type == OperationalNoveltyChangeType.Opening)
        {
            if (entries.ContainsKey(change.NoveltyId))
            {
                throw new InvalidOperationException("La novedad ya fue abierta.");
            }

            entries.Add(change.NoveltyId, OperationalNoveltyTimelineEntry.Open(change));
            return;
        }

        if (!entries.TryGetValue(change.NoveltyId, out OperationalNoveltyTimelineEntry? current))
        {
            throw new InvalidOperationException("La novedad que se intenta cerrar no existe.");
        }

        if (!current.IsOpen)
        {
            throw new InvalidOperationException("La novedad ya fue cerrada.");
        }

        if (change.OccurredAt < current.StartedAt)
        {
            throw new InvalidOperationException(
                "Una novedad no puede finalizar antes de su inicio.");
        }

        entries[change.NoveltyId] = current.Close(change);
    }
}
