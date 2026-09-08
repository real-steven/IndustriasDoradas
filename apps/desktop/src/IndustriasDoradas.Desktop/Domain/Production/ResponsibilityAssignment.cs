namespace IndustriasDoradas.Desktop.Domain.Production;

public sealed record ResponsibilityAssignment
{
    internal ResponsibilityAssignment(
        Guid workerId,
        DateTimeOffset startedAt,
        DateTimeOffset? endedAt = null)
    {
        if (workerId == Guid.Empty)
        {
            throw new ArgumentException("El responsable es obligatorio.", nameof(workerId));
        }

        if (endedAt < startedAt)
        {
            throw new ArgumentOutOfRangeException(
                nameof(endedAt),
                "El fin de una asignación no puede ser anterior a su inicio.");
        }

        WorkerId = workerId;
        StartedAt = startedAt.ToUniversalTime();
        EndedAt = endedAt?.ToUniversalTime();
    }

    public Guid WorkerId { get; }

    public DateTimeOffset StartedAt { get; }

    public DateTimeOffset? EndedAt { get; }

    public bool IsCurrent => EndedAt is null;

    internal ResponsibilityAssignment EndAt(DateTimeOffset endedAt) =>
        new(WorkerId, StartedAt, endedAt);
}
