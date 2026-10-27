using IndustriasDoradas.Desktop.Domain.Inventory;

namespace IndustriasDoradas.Desktop.Tests.Domain;

[TestClass]
public sealed class InventoryMaintenanceDomainTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid OtherPlantId = Guid.Parse("31000000-0000-4000-8000-000000000002");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid ManagerId = Guid.Parse("52000000-0000-4000-8000-000000000001");
    private static readonly Guid OtherManagerId = Guid.Parse("52000000-0000-4000-8000-000000000002");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid RastraId = Guid.Parse("46000000-0000-4000-8000-000000000001");
    private static readonly Guid OtherRastraId = Guid.Parse("46000000-0000-4000-8000-000000000002");
    private static readonly Guid LineId = Guid.Parse("43000000-0000-4000-8000-000000000001");

    [TestMethod]
    public void InstallationKeepsArticleQuantityConditionAndAuditWithoutHardcodedComponentName()
    {
        InventoryItem item = Item(1, "Filtro artesanal", "repuesto particular");
        RastraComponentChange installation = RastraComponentChange.Install(
            ChangeId(1),
            InstallationId(1),
            Context(1, WorkerId),
            RastraId,
            item,
            2m,
            At(0, 8, 0),
            At(0, 8, 1),
            "  nuevo  ",
            "  lote A-7  ",
            "  Instalación inicial.  ");

        RastraComponentTimelineSnapshot snapshot = ComponentTimeline(installation);
        RastraComponentTimelineEntry entry = snapshot.Entries[0];

        Assert.AreEqual(item.Id, entry.InventoryItemId);
        Assert.AreEqual("REPUESTO_PARTICULAR", entry.InventoryItemTypeCode);
        Assert.AreEqual(2m, entry.Quantity);
        Assert.AreEqual("UNIDAD", entry.UnitCode);
        Assert.AreEqual("lote A-7", entry.ComponentIdentifier);
        Assert.AreEqual("nuevo", entry.InstalledCondition);
        Assert.AreEqual(ManagerId, entry.InstalledByProfileId);
        Assert.AreEqual(WorkerId, entry.InstallationResponsibleWorkerId);
        Assert.AreEqual("Instalación inicial.", entry.InstallationNotes);
        Assert.IsTrue(entry.IsActive);
    }

    [TestMethod]
    public void TwoReplacementsProduceContinuousTimelineAndKeepEveryPriorInstallation()
    {
        RastraComponentChange initial = Install(1, 1, Item(1, "Componente A"), At(0, 8, 0));
        RastraComponentChange firstReplacement = Replace(
            2, 2, 1, Item(2, "Componente B"), At(30, 8, 0));
        RastraComponentChange secondReplacement = Replace(
            3, 3, 2, Item(3, "Componente C"), At(60, 8, 0));

        RastraComponentTimelineSnapshot snapshot = ComponentTimeline(
            initial,
            firstReplacement,
            secondReplacement);

        Assert.HasCount(3, snapshot.Entries);
        Assert.HasCount(3, snapshot.Changes);
        Assert.HasCount(1, snapshot.ActiveInstallations);
        Assert.AreEqual(InstallationId(3), snapshot.ActiveInstallations[0].InstallationId);

        RastraComponentTimelineEntry first = snapshot.Entries[0];
        RastraComponentTimelineEntry second = snapshot.Entries[1];
        RastraComponentTimelineEntry third = snapshot.Entries[2];
        Assert.AreEqual(InstallationId(2), first.ReplacedByInstallationId);
        Assert.AreEqual(InstallationId(1), second.ReplacesInstallationId);
        Assert.AreEqual(InstallationId(3), second.ReplacedByInstallationId);
        Assert.AreEqual(InstallationId(2), third.ReplacesInstallationId);
        Assert.AreEqual(TimeSpan.FromDays(30), first.Lifetime);
        Assert.AreEqual(TimeSpan.FromDays(30), second.Lifetime);
        Assert.IsNull(third.RemovedAt);
        Assert.AreEqual("desgastado", first.RemovedCondition);
        Assert.AreEqual("Reemplazo por condición visual.", first.RemovalReason);
    }
    [TestMethod]
    public void RemovalClosesExactInstallationAndCannotCloseItAgain()
    {
        RastraComponentChange initial = Install(1, 1, Item(1, "Componente A"), At(0, 8, 0));
        RastraComponentChange removal = RastraComponentChange.Remove(
            ChangeId(2),
            InstallationId(1),
            Context(2, WorkerId),
            RastraId,
            At(5, 10, 0),
            At(5, 10, 1),
            "dañado",
            "Retiro preventivo.",
            "Se entrega a revisión.");
        RastraComponentChange repeated = RastraComponentChange.Remove(
            ChangeId(3),
            InstallationId(1),
            Context(3),
            RastraId,
            At(6, 10, 0),
            At(6, 10, 1),
            "dañado",
            "Segundo retiro.");

        RastraComponentTimelineSnapshot snapshot = ComponentTimeline(initial, removal);

        Assert.IsFalse(snapshot.Entries[0].IsActive);
        Assert.AreEqual("dañado", snapshot.Entries[0].RemovedCondition);
        Assert.AreEqual(WorkerId, snapshot.Entries[0].RemovalResponsibleWorkerId);
        Assert.HasCount(0, snapshot.ActiveInstallations);
        Assert.ThrowsExactly<InvalidOperationException>(() =>
            ComponentTimeline(initial, removal, repeated));
    }

    [TestMethod]
    public void ComponentHistoryRejectsMissingEarlierOrAnotherRastraReplacement()
    {
        InventoryItem replacementItem = Item(2, "Componente B");
        RastraComponentChange missing = Replace(
            2, 2, 1, replacementItem, At(10, 8, 0));
        Assert.ThrowsExactly<InvalidOperationException>(() => ComponentTimeline(missing));

        RastraComponentChange initial = Install(1, 1, Item(1, "Componente A"), At(5, 8, 0));
        RastraComponentChange earlier = Replace(
            2, 2, 1, replacementItem, At(4, 8, 0));
        Assert.ThrowsExactly<InvalidOperationException>(() => ComponentTimeline(initial, earlier));

        RastraComponentChange anotherRastra = RastraComponentChange.Replace(
            ChangeId(3),
            InstallationId(2),
            InstallationId(1),
            Context(3),
            OtherRastraId,
            replacementItem,
            1m,
            At(10, 8, 0),
            At(10, 8, 1),
            "desgastado",
            "nuevo",
            "Reemplazo equivocado.");
        Assert.ThrowsExactly<InvalidOperationException>(() =>
            ComponentTimeline(initial, anotherRastra));
    }
    [TestMethod]
    public void ComponentChangesAreIdempotentAndRejectAReusedStationSequence()
    {
        RastraComponentChange initial = Install(1, 1, Item(1, "Componente A"), At(0, 8, 0));
        RastraComponentTimelineSnapshot retry = ComponentTimeline(initial, initial);

        Assert.HasCount(1, retry.Changes);
        Assert.HasCount(1, retry.Entries);

        RastraComponentChange conflicting = RastraComponentChange.Install(
            ChangeId(2),
            InstallationId(2),
            Context(1),
            RastraId,
            Item(2, "Componente B"),
            1m,
            At(1, 8, 0),
            At(1, 8, 1),
            "nuevo");
        Assert.ThrowsExactly<InvalidOperationException>(() =>
            ComponentTimeline(initial, conflicting));
    }

    [TestMethod]
    public void NewInstallationRequiresActiveItemValidQuantityConditionAndReason()
    {
        InventoryItem inactive = Item(1, "Componente inactivo", isActive: false);
        Assert.ThrowsExactly<InvalidOperationException>(() => RastraComponentChange.Install(
            ChangeId(1), InstallationId(1), Context(1), RastraId, inactive, 1m,
            At(0, 8, 0), At(0, 8, 1), "nuevo"));

        InventoryItem active = Item(2, "Componente activo");
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => RastraComponentChange.Install(
            ChangeId(2), InstallationId(2), Context(2), RastraId, active, 1.5m,
            At(0, 8, 0), At(0, 8, 1), "nuevo"));
        Assert.ThrowsExactly<ArgumentException>(() => RastraComponentChange.Install(
            ChangeId(3), InstallationId(3), Context(3), RastraId, active, 1m,
            At(0, 8, 0), At(0, 8, 1), " "));
        Assert.ThrowsExactly<ArgumentException>(() => RastraComponentChange.Remove(
            ChangeId(4), InstallationId(3), Context(4), RastraId,
            At(1, 8, 0), At(1, 8, 1), "desgastado", " "));
    }

    [TestMethod]
    public void PlantNoveltyMayKeepCategoryLineResponsibleAndEndOptional()
    {
        OperationalNoveltyChange opening = OperationalNoveltyChange.Open(
            ChangeId(20),
            NoveltyId(1),
            Context(20),
            At(0, 9, 0),
            At(0, 9, 1),
            "  No hubo producción por feriado.  ");

        OperationalNoveltyHistorySnapshot snapshot = NoveltyHistory(opening);
        OperationalNoveltyTimelineEntry entry = snapshot.Entries[0];

        Assert.IsTrue(entry.IsOpen);
        Assert.IsNull(entry.LineId);
        Assert.IsNull(entry.CategoryId);
        Assert.IsNull(entry.OpeningResponsibleWorkerId);
        Assert.AreEqual("No hubo producción por feriado.", entry.Description);
        Assert.IsTrue(entry.Covers(At(2, 8, 0)));
        Assert.HasCount(1, snapshot.OpenEntries);
    }

    [TestMethod]
    public void LineMaintenanceMayCrossWorkPeriodAndKeepsOpeningAndClosureActors()
    {
        OperationalNoveltyCategory maintenance = OperationalNoveltyCategory.Create(
            CategoryId(1),
            " mantenimiento ",
            "Mantenimiento");
        OperationalNoveltyChange opening = OperationalNoveltyChange.Open(
            ChangeId(20),
            NoveltyId(1),
            Context(20, WorkerId),
            At(0, 17, 30),
            At(0, 17, 31),
            "Cambio de pieza en la rastra.",
            LineId,
            maintenance);
        OperationalNoveltyChange closure = OperationalNoveltyChange.Close(
            ChangeId(21),
            NoveltyId(1),
            ManagementContext(OtherManagerId),
            At(0, 19, 15),
            At(0, 19, 16));

        OperationalNoveltyTimelineEntry entry = NoveltyHistory(opening, closure).Entries[0];

        Assert.IsFalse(entry.IsOpen);
        Assert.AreEqual(LineId, entry.LineId);
        Assert.AreEqual("MANTENIMIENTO", entry.CategoryCode);
        Assert.AreEqual(ManagerId, entry.OpenedByProfileId);
        Assert.AreEqual(OtherManagerId, entry.ClosedByProfileId);
        Assert.AreEqual(WorkerId, entry.OpeningResponsibleWorkerId);
        Assert.AreEqual(TimeSpan.FromMinutes(105), entry.Duration);
        Assert.IsTrue(entry.Covers(At(0, 18, 30)));
        Assert.IsFalse(entry.Covers(At(0, 20, 0)));
    }
    [TestMethod]
    public void NoveltyRequiresDescriptionAndRejectsInactiveCategory()
    {
        Assert.ThrowsExactly<ArgumentException>(() => OperationalNoveltyChange.Open(
            ChangeId(20), NoveltyId(1), Context(20), At(0, 8, 0), At(0, 8, 1), " "));

        OperationalNoveltyCategory inactive = OperationalNoveltyCategory.Create(
            CategoryId(1), "OTRO", "Otro", isActive: false);
        Assert.ThrowsExactly<InvalidOperationException>(() => OperationalNoveltyChange.Open(
            ChangeId(21), NoveltyId(2), Context(21), At(0, 8, 0), At(0, 8, 1),
            "Categoría desactivada.", category: inactive));
    }

    [TestMethod]
    public void NoveltyCannotCloseBeforeOpeningOrCloseTwice()
    {
        OperationalNoveltyChange opening = OperationalNoveltyChange.Open(
            ChangeId(20), NoveltyId(1), Context(20), At(1, 8, 0), At(1, 8, 1),
            "Paro de prueba.");
        OperationalNoveltyChange earlier = OperationalNoveltyChange.Close(
            ChangeId(21), NoveltyId(1), Context(21), At(0, 8, 0), At(1, 8, 2));
        Assert.ThrowsExactly<InvalidOperationException>(() => NoveltyHistory(opening, earlier));

        OperationalNoveltyChange closure = OperationalNoveltyChange.Close(
            ChangeId(22), NoveltyId(1), Context(22), At(1, 9, 0), At(1, 9, 1));
        OperationalNoveltyChange repeated = OperationalNoveltyChange.Close(
            ChangeId(23), NoveltyId(1), Context(23), At(1, 10, 0), At(1, 10, 1));
        Assert.ThrowsExactly<InvalidOperationException>(() =>
            NoveltyHistory(opening, closure, repeated));
    }

    [TestMethod]
    public void NoveltyChangesAreIdempotentAndRejectAReusedStationSequence()
    {
        OperationalNoveltyChange opening = OperationalNoveltyChange.Open(
            ChangeId(20), NoveltyId(1), Context(20), At(0, 8, 0), At(0, 8, 1),
            "Emergencia controlada.");
        OperationalNoveltyHistorySnapshot retry = NoveltyHistory(opening, opening);

        Assert.HasCount(1, retry.Changes);
        Assert.HasCount(1, retry.Entries);

        OperationalNoveltyChange conflicting = OperationalNoveltyChange.Open(
            ChangeId(21), NoveltyId(2), Context(20), At(0, 9, 0), At(0, 9, 1),
            "Otro evento.");
        Assert.ThrowsExactly<InvalidOperationException>(() =>
            NoveltyHistory(opening, conflicting));
    }

    [TestMethod]
    public void HistoriesRejectRecordsFromAnotherPlant()
    {
        PlantRecordContext otherContext = PlantRecordContext.ForManagement(
            OrganizationId,
            OtherPlantId,
            ManagerId);
        OperationalNoveltyChange remoteNovelty = OperationalNoveltyChange.Open(
            ChangeId(20), NoveltyId(1), otherContext, At(0, 8, 0), At(0, 8, 1),
            "Novedad de otra planta.");
        Assert.ThrowsExactly<InvalidOperationException>(() => NoveltyHistory(remoteNovelty));

        InventoryItem remoteItem = InventoryItem.Create(
            ItemId(9),
            OrganizationId,
            OtherPlantId,
            InventoryItemType.Create(TypeId(9), "REPUESTO", "Repuesto"),
            Unit(),
            "Componente remoto");
        Assert.ThrowsExactly<ArgumentException>(() => RastraComponentChange.Install(
            ChangeId(9), InstallationId(9), Context(9), RastraId, remoteItem, 1m,
            At(0, 8, 0), At(0, 8, 1), "nuevo"));
    }
    private static RastraComponentTimelineSnapshot ComponentTimeline(
        params RastraComponentChange[] changes) =>
        RastraComponentTimeline.Project(OrganizationId, PlantId, RastraId, changes);

    private static OperationalNoveltyHistorySnapshot NoveltyHistory(
        params OperationalNoveltyChange[] changes) =>
        OperationalNoveltyHistory.Project(OrganizationId, PlantId, changes);

    private static RastraComponentChange Install(
        int changeSuffix,
        int installationSuffix,
        InventoryItem item,
        DateTimeOffset installedAt) =>
        RastraComponentChange.Install(
            ChangeId(changeSuffix),
            InstallationId(installationSuffix),
            Context(changeSuffix, WorkerId),
            RastraId,
            item,
            1m,
            installedAt,
            installedAt.AddMinutes(1),
            "nuevo",
            $"COMP-{installationSuffix}");

    private static RastraComponentChange Replace(
        int changeSuffix,
        int newInstallationSuffix,
        int replacedInstallationSuffix,
        InventoryItem item,
        DateTimeOffset replacedAt) =>
        RastraComponentChange.Replace(
            ChangeId(changeSuffix),
            InstallationId(newInstallationSuffix),
            InstallationId(replacedInstallationSuffix),
            Context(changeSuffix, WorkerId),
            RastraId,
            item,
            1m,
            replacedAt,
            replacedAt.AddMinutes(1),
            "desgastado",
            "nuevo",
            "Reemplazo por condición visual.",
            $"COMP-{newInstallationSuffix}");

    private static PlantRecordContext Context(int sequence, Guid? workerId = null) =>
        PlantRecordContext.ForStation(
            OrganizationId,
            PlantId,
            StationId,
            sequence,
            ManagerId,
            workerId);

    private static PlantRecordContext ManagementContext(Guid actorProfileId) =>
        PlantRecordContext.ForManagement(OrganizationId, PlantId, actorProfileId);

    private static InventoryItem Item(
        int suffix,
        string name,
        string typeCode = "REPUESTO",
        bool isActive = true) =>
        InventoryItem.Create(
            ItemId(suffix),
            OrganizationId,
            PlantId,
            InventoryItemType.Create(TypeId(suffix), typeCode, typeCode),
            Unit(),
            name,
            isActive);

    private static InventoryUnit Unit() =>
        InventoryUnit.Create(
            Guid.Parse("70000000-0000-4000-8005-000000000001"),
            "UNIDAD",
            "unidades",
            0);

    private static DateTimeOffset At(int dayOffset, int hour, int minute) =>
        new DateTimeOffset(2026, 10, 26, hour, minute, 0, TimeSpan.FromHours(-6))
            .AddDays(dayOffset);

    private static Guid ChangeId(int suffix) =>
        Guid.Parse($"70000000-0000-4000-8006-{suffix:D12}");

    private static Guid InstallationId(int suffix) =>
        Guid.Parse($"70000000-0000-4000-8007-{suffix:D12}");

    private static Guid NoveltyId(int suffix) =>
        Guid.Parse($"70000000-0000-4000-8008-{suffix:D12}");

    private static Guid CategoryId(int suffix) =>
        Guid.Parse($"70000000-0000-4000-8009-{suffix:D12}");

    private static Guid ItemId(int suffix) =>
        Guid.Parse($"70000000-0000-4000-8010-{suffix:D12}");

    private static Guid TypeId(int suffix) =>
        Guid.Parse($"70000000-0000-4000-8011-{suffix:D12}");
}
