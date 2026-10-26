namespace IndustriasDoradas.Desktop.Domain.Inventory;

public sealed record InventoryItemType
{
    private InventoryItemType(Guid id, string code, string name, bool isCustom, bool isActive)
    {
        Id = Require(id, nameof(id));
        Code = NormalizeCode(code, nameof(code));
        Name = RequireText(name, nameof(name));
        IsCustom = isCustom;
        IsActive = isActive;
    }

    public Guid Id { get; }

    public string Code { get; }

    public string Name { get; }

    public bool IsCustom { get; }

    public bool IsActive { get; }

    public static InventoryItemType Create(
        Guid id,
        string code,
        string name,
        bool isCustom = false,
        bool isActive = true) =>
        new(id, code, name, isCustom, isActive);

    private static string NormalizeCode(string value, string parameterName) =>
        RequireText(value, parameterName).Replace(' ', '_').ToUpperInvariant();

    internal static Guid Require(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("El identificador es obligatorio.", parameterName);
        }

        return value;
    }

    internal static string RequireText(string value, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("El texto es obligatorio.", parameterName);
        }

        return value.Trim();
    }
}

public sealed record InventoryUnit
{
    private InventoryUnit(Guid id, string code, string name, int decimalPlaces, bool isCustom)
    {
        Id = InventoryItemType.Require(id, nameof(id));
        Code = InventoryItemType.RequireText(code, nameof(code))
            .Replace(' ', '_')
            .ToUpperInvariant();
        Name = InventoryItemType.RequireText(name, nameof(name));
        if (decimalPlaces is < 0 or > 3)
        {
            throw new ArgumentOutOfRangeException(
                nameof(decimalPlaces),
                "La precisión de inventario debe estar entre cero y tres decimales.");
        }

        DecimalPlaces = decimalPlaces;
        IsCustom = isCustom;
    }

    public Guid Id { get; }

    public string Code { get; }

    public string Name { get; }

    public int DecimalPlaces { get; }

    public bool IsCustom { get; }

    public static InventoryUnit Create(
        Guid id,
        string code,
        string name,
        int decimalPlaces,
        bool isCustom = false) =>
        new(id, code, name, decimalPlaces, isCustom);

    public void EnsureValidQuantity(decimal quantity, string parameterName, bool allowZero = false)
    {
        decimal absolute = Math.Abs(quantity);
        if ((!allowZero && absolute == 0m) || absolute != decimal.Round(absolute, DecimalPlaces))
        {
            string zeroRule = allowZero ? "no negativa" : "mayor que cero";
            throw new ArgumentOutOfRangeException(
                parameterName,
                $"La cantidad debe ser {zeroRule} y admitir como máximo {DecimalPlaces} decimales para {Name}.");
        }
    }
}

public sealed record InventoryItem
{
    private InventoryItem(
        Guid id,
        Guid organizationId,
        Guid plantId,
        InventoryItemType type,
        InventoryUnit unit,
        string name,
        bool isActive)
    {
        ArgumentNullException.ThrowIfNull(type);
        ArgumentNullException.ThrowIfNull(unit);

        Id = InventoryItemType.Require(id, nameof(id));
        OrganizationId = InventoryItemType.Require(organizationId, nameof(organizationId));
        PlantId = InventoryItemType.Require(plantId, nameof(plantId));
        Type = type;
        Unit = unit;
        Name = InventoryItemType.RequireText(name, nameof(name));
        IsActive = isActive;
    }

    public Guid Id { get; }

    public Guid OrganizationId { get; }

    public Guid PlantId { get; }

    public InventoryItemType Type { get; }

    public InventoryUnit Unit { get; }

    public string Name { get; }

    public bool IsActive { get; }

    public static InventoryItem Create(
        Guid id,
        Guid organizationId,
        Guid plantId,
        InventoryItemType type,
        InventoryUnit unit,
        string name,
        bool isActive = true) =>
        new(id, organizationId, plantId, type, unit, name, isActive);
}
