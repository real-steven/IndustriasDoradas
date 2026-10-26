using IndustriasDoradas.Desktop.Domain.Inventory;

namespace IndustriasDoradas.Desktop.Tests.Domain;

[TestClass]
public sealed class InventoryDomainTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantManagerId = Guid.Parse("52000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");

    [TestMethod]
    public void CustomTypesAndItemsKeepRequiredTypeNameAndUnit()
    {
        InventoryItemType custom = InventoryItemType.Create(
            TypeId(1),
            "  seguridad especial ",
            "Seguridad especial",
            isCustom: true);
        InventoryUnit unit = Unit("UNIDAD", "unidades", decimalPlaces: 0);
        InventoryItem item = InventoryItem.Create(
            ItemId(1),
            OrganizationId,
            PlantId,
            custom,
            unit,
            "  Cadena reforzada ");

        Assert.AreEqual("SEGURIDAD_ESPECIAL", custom.Code);
        Assert.IsTrue(custom.IsCustom);
        Assert.AreEqual("Cadena reforzada", item.Name);
        Assert.AreEqual("UNIDAD", item.Unit.Code);

        Assert.ThrowsExactly<ArgumentException>(() => InventoryItem.Create(
            ItemId(2),
            OrganizationId,
            PlantId,
            custom,
            unit,
            " "));
    }

    [TestMethod]
    public void UnitControlsPrecisionWithoutAQuantityRuleGlobalToEveryItem()
    {
        InventoryItem hammers = Item("Martillos", Unit("UNIDAD", "unidades", 0));
        InventoryItem mercury = Item("Mercurio", Unit("GRAMO", "gramos", 3), suffix: 2);

        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => InventoryMovement.Entry(
            MovementId(1),
            Context(1),
            hammers,
            1.5m,
            At(8, 0),
            At(8, 1)));

        InventoryMovement measured = InventoryMovement.Entry(
            MovementId(2),
            Context(2),
            mercury,
            1.125m,
            At(8, 0),
            At(8, 1));

        Assert.AreEqual(1.125m, measured.Quantity);
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => InventoryMovement.Entry(
            MovementId(3),
            Context(3),
            mercury,
            1.1255m,
            At(8, 0),
            At(8, 1)));
    }

    [TestMethod]
    public void ManualHammerLedgerMatchesApprovedEntryExitReturnAdjustmentAndReversal()
    {
        InventoryItem hammers = Item("Martillos", Unit("UNIDAD", "unidades", 0));
        InventoryMovement entry = Entry(hammers, 1, 10m);
        InventoryMovement exit = Exit(hammers, 2, 4m, destination: "Taller");
        InventoryMovement returned = InventoryMovement.Return(
            MovementId(3),
            Context(3, WorkerId),
            hammers,
            2m,
            At(10, 0),
            At(10, 1),
            exit.ClientMovementId,
            "Regresaron dos martillos.");
        InventoryMovement adjustment = InventoryMovement.Adjustment(
            MovementId(4),
            Context(4),
            hammers,
            -1m,
            At(11, 0),
            At(11, 1),
            "Conteo físico encontró una unidad menos.");
        InventoryMovement reversal = InventoryMovement.Reversal(
            MovementId(5),
            Context(5),
            hammers,
            adjustment,
            At(11, 5),
            At(11, 6),
            "El conteo se digitó para el artículo equivocado.");

        InventoryLedgerSnapshot snapshot = InventoryLedger.Project(
            hammers,
            [entry, exit, returned, adjustment, reversal]);

        Assert.AreEqual(8m, snapshot.Balance);
        Assert.HasCount(5, snapshot.Movements);
        Assert.IsTrue(snapshot.ReversedMovementIds.Contains(adjustment.ClientMovementId));
        Assert.AreEqual("Taller", exit.Destination);
        Assert.AreEqual(WorkerId, returned.Context.ResponsibleWorkerId);
    }

    [TestMethod]
    public void ConsumptionIsPermanentAndProducesExpectedSaltBalance()
    {
        InventoryItem salt = Item("Sal", Unit("KILOGRAMO", "kilogramos", 3));
        InventoryMovement entry = Entry(salt, 1, 20m);
        InventoryMovement consumption = InventoryMovement.Consumption(
            MovementId(2),
            Context(2),
            salt,
            3m,
            At(9, 0),
            At(9, 1),
            notes: "Uso operativo.");

        InventoryLedgerSnapshot snapshot = InventoryLedger.Project(salt, [entry, consumption]);

        Assert.AreEqual(17m, snapshot.Balance);
        Assert.AreEqual(-3m, consumption.QuantityDelta);
        Assert.AreEqual(InventoryMovementType.Consumption, consumption.Type);
    }

    [TestMethod]
    public void MovementThatExceedsAvailableStockIsRejectedWithBothQuantities()
    {
        InventoryItem hammers = Item("Martillos", Unit("UNIDAD", "unidades", 0));
        InventoryMovement entry = Entry(hammers, 1, 4m);
        InventoryMovement invalidExit = Exit(hammers, 2, 5m);

        InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(() =>
            InventoryLedger.Project(hammers, [entry, invalidExit]));

        StringAssert.Contains(exception.Message, "5");
        StringAssert.Contains(exception.Message, "4");
        StringAssert.Contains(exception.Message, "excede");
    }

    [TestMethod]
    public void ReversalCompensatesExactlyOnceWithoutRemovingOriginalMovement()
    {
        InventoryItem hammers = Item("Martillos", Unit("UNIDAD", "unidades", 0));
        InventoryMovement entry = Entry(hammers, 1, 10m);
        InventoryMovement exit = Exit(hammers, 2, 4m);
        InventoryMovement reversal = InventoryMovement.Reversal(
            MovementId(3),
            Context(3),
            hammers,
            exit,
            At(10, 0),
            At(10, 1),
            "Salida registrada por error.");
        InventoryMovement repeated = InventoryMovement.Reversal(
            MovementId(4),
            Context(4),
            hammers,
            exit,
            At(10, 2),
            At(10, 3),
            "Segundo intento.");

        InventoryLedgerSnapshot snapshot = InventoryLedger.Project(hammers, [entry, exit, reversal]);

        Assert.AreEqual(10m, snapshot.Balance);
        Assert.HasCount(3, snapshot.Movements);
        Assert.ThrowsExactly<InvalidOperationException>(() =>
            InventoryLedger.Project(hammers, [entry, exit, reversal, repeated]));
    }

    [TestMethod]
    public void LinkedReturnsCannotExceedTheirOriginalExit()
    {
        InventoryItem hammers = Item("Martillos", Unit("UNIDAD", "unidades", 0));
        InventoryMovement entry = Entry(hammers, 1, 10m);
        InventoryMovement exit = Exit(hammers, 2, 4m);
        InventoryMovement firstReturn = InventoryMovement.Return(
            MovementId(3),
            Context(3),
            hammers,
            3m,
            At(10, 0),
            At(10, 1),
            exit.ClientMovementId);
        InventoryMovement excessiveReturn = InventoryMovement.Return(
            MovementId(4),
            Context(4),
            hammers,
            2m,
            At(11, 0),
            At(11, 1),
            exit.ClientMovementId);

        Assert.ThrowsExactly<InvalidOperationException>(() => InventoryLedger.Project(
            hammers,
            [entry, exit, firstReturn, excessiveReturn]));
    }

    [TestMethod]
    public void IdenticalRetryIsIdempotentButConflictingUuidIsRejected()
    {
        InventoryItem hammers = Item("Martillos", Unit("UNIDAD", "unidades", 0));
        InventoryMovement entry = Entry(hammers, 1, 10m);
        InventoryLedgerSnapshot snapshot = InventoryLedger.Project(hammers, [entry, entry]);

        Assert.AreEqual(10m, snapshot.Balance);
        Assert.HasCount(1, snapshot.Movements);

        InventoryMovement conflicting = InventoryMovement.Entry(
            entry.ClientMovementId,
            Context(2),
            hammers,
            11m,
            At(8, 0),
            At(8, 1));
        Assert.ThrowsExactly<InvalidOperationException>(() =>
            InventoryLedger.Project(hammers, [entry, conflicting]));
    }

    [TestMethod]
    public void StationSequenceCannotBeReusedForDifferentMovements()
    {
        InventoryItem hammers = Item("Martillos", Unit("UNIDAD", "unidades", 0));
        InventoryMovement first = Entry(hammers, 1, 10m);
        InventoryMovement second = InventoryMovement.Entry(
            MovementId(2),
            Context(1),
            hammers,
            2m,
            At(8, 2),
            At(8, 3));

        Assert.ThrowsExactly<InvalidOperationException>(() =>
            InventoryLedger.Project(hammers, [first, second]));
    }

    [TestMethod]
    public void LedgerCannotMixItemsOrganizationsPlantsOrUnits()
    {
        InventoryItem hammers = Item("Martillos", Unit("UNIDAD", "unidades", 0));
        InventoryItem chains = Item("Cadenas", Unit("METRO", "metros", 3), suffix: 2);
        InventoryMovement chainEntry = Entry(chains, 1, 5m);

        Assert.ThrowsExactly<InvalidOperationException>(() =>
            InventoryLedger.Project(hammers, [chainEntry]));
    }

    [TestMethod]
    public void AdjustmentAndReversalRequireReasons()
    {
        InventoryItem hammers = Item("Martillos", Unit("UNIDAD", "unidades", 0));
        InventoryMovement entry = Entry(hammers, 1, 10m);

        Assert.ThrowsExactly<ArgumentException>(() => InventoryMovement.Adjustment(
            MovementId(2),
            Context(2),
            hammers,
            -1m,
            At(9, 0),
            At(9, 1),
            " "));
        Assert.ThrowsExactly<ArgumentException>(() => InventoryMovement.Reversal(
            MovementId(3),
            Context(3),
            hammers,
            entry,
            At(9, 0),
            At(9, 1),
            " "));
    }

    [TestMethod]
    public void ReviewWithoutDifferencesDoesNotCreateOrChangeStock()
    {
        InventoryItem filters = Item("Filtros", Unit("UNIDAD", "unidades", 0));
        InventoryMovement entry = Entry(filters, 1, 5m);
        InventoryReview review = InventoryReview.Create(
            ReviewId(1),
            OrganizationId,
            PlantId,
            PlantManagerId,
            At(12, 0),
            [InventoryReviewLine.Create(filters, 5m, 5m)]);

        InventoryLedgerSnapshot snapshot = InventoryLedger.Project(filters, [entry]);

        Assert.AreEqual(InventoryReviewStatus.WithoutDifferences, review.Status);
        Assert.AreEqual(0m, review.Lines[0].Difference);
        Assert.AreEqual(5m, snapshot.Balance);
    }

    [TestMethod]
    public void ReviewDifferenceRequiresSeparateMotivatedAdjustment()
    {
        InventoryItem filters = Item("Filtros", Unit("UNIDAD", "unidades", 0));
        InventoryMovement entry = Entry(filters, 1, 5m);
        InventoryReview review = InventoryReview.Create(
            ReviewId(1),
            OrganizationId,
            PlantId,
            PlantManagerId,
            At(12, 0),
            [InventoryReviewLine.Create(filters, 5m, 4m)],
            "Conteo mensual.");
        InventoryMovement adjustment = InventoryMovement.Adjustment(
            MovementId(2),
            Context(2),
            filters,
            review.Lines[0].Difference,
            At(12, 5),
            At(12, 6),
            "Diferencia confirmada durante conteo físico.");

        Assert.AreEqual(InventoryReviewStatus.WithDifferences, review.Status);
        Assert.AreEqual(5m, InventoryLedger.Project(filters, [entry]).Balance);
        Assert.AreEqual(4m, InventoryLedger.Project(filters, [entry, adjustment]).Balance);
    }

    [TestMethod]
    public void ManagementMovementNeedsNoStationButKeepsAuthenticatedActor()
    {
        InventoryItem filters = Item("Filtros", Unit("UNIDAD", "unidades", 0));
        InventoryMovementContext management = InventoryMovementContext.ForManagement(
            OrganizationId,
            PlantId,
            PlantManagerId);
        InventoryMovement entry = InventoryMovement.Entry(
            MovementId(1),
            management,
            filters,
            2m,
            At(8, 0),
            At(8, 1),
            notes: "Registro excepcional desde web.");

        Assert.IsNull(entry.Context.StationId);
        Assert.IsNull(entry.Context.ClientSequence);
        Assert.AreEqual(PlantManagerId, entry.Context.ActorProfileId);
        Assert.AreEqual(2m, InventoryLedger.Project(filters, [entry]).Balance);
    }

    [TestMethod]
    public void ReviewCannotMixArticlesFromAnotherPlant()
    {
        InventoryItem local = Item("Filtros", Unit("UNIDAD", "unidades", 0));
        InventoryItem remote = InventoryItem.Create(
            ItemId(2),
            OrganizationId,
            Guid.Parse("31000000-0000-4000-8000-000000000002"),
            InventoryItemType.Create(TypeId(2), "REPUESTO", "Repuesto"),
            Unit("UNIDAD", "unidades", 0),
            "Filtro remoto");

        Assert.ThrowsExactly<ArgumentException>(() => InventoryReview.Create(
            ReviewId(1),
            OrganizationId,
            PlantId,
            PlantManagerId,
            At(12, 0),
            [
                InventoryReviewLine.Create(local, 5m, 5m),
                InventoryReviewLine.Create(remote, 2m, 2m),
            ]));
    }

    private static InventoryMovement Entry(InventoryItem item, int suffix, decimal quantity) =>
        InventoryMovement.Entry(
            MovementId(suffix),
            Context(suffix),
            item,
            quantity,
            At(8, suffix),
            At(8, suffix).AddSeconds(1));

    private static InventoryMovement Exit(
        InventoryItem item,
        int suffix,
        decimal quantity,
        string? destination = null) =>
        InventoryMovement.Exit(
            MovementId(suffix),
            Context(suffix),
            item,
            quantity,
            At(9, suffix),
            At(9, suffix).AddSeconds(1),
            destination);

    private static InventoryMovementContext Context(int sequence, Guid? workerId = null) =>
        InventoryMovementContext.ForStation(
            OrganizationId,
            PlantId,
            StationId,
            sequence,
            PlantManagerId,
            workerId);

    private static InventoryItem Item(
        string name,
        InventoryUnit unit,
        int suffix = 1) =>
        InventoryItem.Create(
            ItemId(suffix),
            OrganizationId,
            PlantId,
            InventoryItemType.Create(TypeId(suffix), "HERRAMIENTA", "Herramienta"),
            unit,
            name);

    private static InventoryUnit Unit(
        string code,
        string name,
        int decimalPlaces) =>
        InventoryUnit.Create(UnitId(code), code, name, decimalPlaces);

    private static DateTimeOffset At(int hour, int minute) =>
        new(2026, 10, 24, hour, minute, 0, TimeSpan.FromHours(-6));

    private static Guid TypeId(int suffix) =>
        Guid.Parse($"70000000-0000-4000-8001-{suffix:D12}");

    private static Guid ItemId(int suffix) =>
        Guid.Parse($"70000000-0000-4000-8002-{suffix:D12}");

    private static Guid MovementId(int suffix) =>
        Guid.Parse($"70000000-0000-4000-8003-{suffix:D12}");

    private static Guid ReviewId(int suffix) =>
        Guid.Parse($"70000000-0000-4000-8004-{suffix:D12}");

    private static Guid UnitId(string code)
    {
        int suffix = Math.Abs(StringComparer.Ordinal.GetHashCode(code)) % 999999;
        return Guid.Parse($"70000000-0000-4000-8005-{suffix:D12}");
    }
}
