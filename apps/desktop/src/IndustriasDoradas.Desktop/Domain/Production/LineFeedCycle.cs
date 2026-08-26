using System.Collections.ObjectModel;

namespace IndustriasDoradas.Desktop.Domain.Production;

public enum LineFeedCycleStatus
{
    Active,
    Completed,
}

public sealed class LineFeedCycle
{
    private readonly List<ResponsibilityAssignment> responsibilities;
    private readonly ReadOnlyCollection<ResponsibilityAssignment> readOnlyResponsibilities;

    internal LineFeedCycle(
        Guid id,
        Guid lineId,
        Guid responsibleWorkerId,
        DateTimeOffset startedAt)
    {
        EnsureRequired(id, nameof(id), "El ciclo de alimentación es obligatorio.");
        EnsureRequired(lineId, nameof(lineId), "La línea es obligatoria.");

        DateTimeOffset normalizedStartedAt = startedAt.ToUniversalTime();
        responsibilities = [new ResponsibilityAssignment(responsibleWorkerId, normalizedStartedAt)];
        readOnlyResponsibilities = responsibilities.AsReadOnly();

        Id = id;
        LineId = lineId;
        StartedAt = normalizedStartedAt;
        Status = LineFeedCycleStatus.Active;
    }

    public Guid Id { get; }

    public Guid LineId { get; }

    public DateTimeOffset StartedAt { get; }

    public DateTimeOffset? CompletedAt { get; private set; }

    public LineFeedCycleStatus Status { get; private set; }

    public IReadOnlyList<ResponsibilityAssignment> Responsibilities => readOnlyResponsibilities;

    public ResponsibilityAssignment CurrentResponsibility =>
        Status == LineFeedCycleStatus.Active
            ? responsibilities[^1]
            : throw new InvalidOperationException("Un ciclo finalizado no tiene responsable vigente.");

    internal void Relieve(Guid nextWorkerId, DateTimeOffset effectiveAt)
    {
        EnsureActive();
        EnsureRequired(nextWorkerId, nameof(nextWorkerId), "El nuevo responsable es obligatorio.");
        effectiveAt = effectiveAt.ToUniversalTime();

        ResponsibilityAssignment current = responsibilities[^1];
        if (current.WorkerId == nextWorkerId)
        {
            throw new InvalidOperationException("El relevo debe asignar a una persona diferente.");
        }

        if (effectiveAt <= current.StartedAt)
        {
            throw new ArgumentOutOfRangeException(
                nameof(effectiveAt),
                "El relevo debe ocurrir después del inicio de la asignación vigente.");
        }

        responsibilities[^1] = current.EndAt(effectiveAt);
        responsibilities.Add(new ResponsibilityAssignment(nextWorkerId, effectiveAt));
    }

    internal void Complete(DateTimeOffset completedAt)
    {
        EnsureActive();
        completedAt = completedAt.ToUniversalTime();

        ResponsibilityAssignment current = responsibilities[^1];
        if (completedAt < current.StartedAt)
        {
            throw new ArgumentOutOfRangeException(
                nameof(completedAt),
                "El ciclo no puede finalizar antes del inicio de la asignación vigente.");
        }

        responsibilities[^1] = current.EndAt(completedAt);
        CompletedAt = completedAt;
        Status = LineFeedCycleStatus.Completed;
    }

    private static void EnsureRequired(Guid value, string parameterName, string message)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException(message, parameterName);
        }
    }

    private void EnsureActive()
    {
        if (Status != LineFeedCycleStatus.Active)
        {
            throw new InvalidOperationException("El ciclo de alimentación ya finalizó.");
        }
    }
}
