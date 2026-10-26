namespace IndustriasDoradas.Desktop.Domain.Inventory;

public enum InventoryReviewStatus
{
    WithoutDifferences,
    WithDifferences,
}

public sealed record InventoryReviewLine
{
    private InventoryReviewLine(
        Guid inventoryItemId,
        Guid organizationId,
        Guid plantId,
        string itemName,
        string unitCode,
        decimal expectedQuantity,
        decimal countedQuantity)
    {
        InventoryItemId = InventoryItemType.Require(inventoryItemId, nameof(inventoryItemId));
        OrganizationId = InventoryItemType.Require(organizationId, nameof(organizationId));
        PlantId = InventoryItemType.Require(plantId, nameof(plantId));
        ItemName = InventoryItemType.RequireText(itemName, nameof(itemName));
        UnitCode = InventoryItemType.RequireText(unitCode, nameof(unitCode));
        ExpectedQuantity = expectedQuantity;
        CountedQuantity = countedQuantity;
    }

    public Guid InventoryItemId { get; }

    public Guid OrganizationId { get; }

    public Guid PlantId { get; }

    public string ItemName { get; }

    public string UnitCode { get; }

    public decimal ExpectedQuantity { get; }

    public decimal CountedQuantity { get; }

    public decimal Difference => CountedQuantity - ExpectedQuantity;

    public static InventoryReviewLine Create(
        InventoryItem item,
        decimal expectedQuantity,
        decimal countedQuantity)
    {
        ArgumentNullException.ThrowIfNull(item);
        item.Unit.EnsureValidQuantity(expectedQuantity, nameof(expectedQuantity), allowZero: true);
        item.Unit.EnsureValidQuantity(countedQuantity, nameof(countedQuantity), allowZero: true);
        if (expectedQuantity < 0m || countedQuantity < 0m)
        {
            throw new ArgumentOutOfRangeException(
                nameof(countedQuantity),
                "Una revisión no puede contener cantidades negativas.");
        }

        return new(
            item.Id,
            item.OrganizationId,
            item.PlantId,
            item.Name,
            item.Unit.Code,
            expectedQuantity,
            countedQuantity);
    }
}

public sealed record InventoryReview
{
    private InventoryReview(
        Guid id,
        Guid organizationId,
        Guid plantId,
        Guid reviewedByProfileId,
        DateTimeOffset reviewedAt,
        IReadOnlyList<InventoryReviewLine> lines,
        string? notes)
    {
        Id = InventoryItemType.Require(id, nameof(id));
        OrganizationId = InventoryItemType.Require(organizationId, nameof(organizationId));
        PlantId = InventoryItemType.Require(plantId, nameof(plantId));
        ReviewedByProfileId = InventoryItemType.Require(
            reviewedByProfileId,
            nameof(reviewedByProfileId));
        ReviewedAt = reviewedAt.ToUniversalTime();
        Lines = lines;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        Status = lines.Any(line => line.Difference != 0m)
            ? InventoryReviewStatus.WithDifferences
            : InventoryReviewStatus.WithoutDifferences;
    }

    public Guid Id { get; }

    public Guid OrganizationId { get; }

    public Guid PlantId { get; }

    public Guid ReviewedByProfileId { get; }

    public DateTimeOffset ReviewedAt { get; }

    public IReadOnlyList<InventoryReviewLine> Lines { get; }

    public string? Notes { get; }

    public InventoryReviewStatus Status { get; }

    public static InventoryReview Create(
        Guid id,
        Guid organizationId,
        Guid plantId,
        Guid reviewedByProfileId,
        DateTimeOffset reviewedAt,
        IEnumerable<InventoryReviewLine> lines,
        string? notes = null)
    {
        ArgumentNullException.ThrowIfNull(lines);
        InventoryReviewLine[] materialized = [.. lines];
        if (materialized.Length == 0)
        {
            throw new ArgumentException("Una revisión debe incluir al menos un artículo.", nameof(lines));
        }

        if (materialized.Select(line => line.InventoryItemId).Distinct().Count() != materialized.Length)
        {
            throw new ArgumentException(
                "Una revisión no puede repetir el mismo artículo.",
                nameof(lines));
        }

        if (materialized.Any(line =>
                line.OrganizationId != organizationId || line.PlantId != plantId))
        {
            throw new ArgumentException(
                "Una revisión no puede mezclar organizaciones o plantas.",
                nameof(lines));
        }

        return new(
            id,
            organizationId,
            plantId,
            reviewedByProfileId,
            reviewedAt,
            Array.AsReadOnly(materialized),
            notes);
    }
}
