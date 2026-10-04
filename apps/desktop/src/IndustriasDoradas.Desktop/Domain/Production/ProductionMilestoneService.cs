namespace IndustriasDoradas.Desktop.Domain.Production;

public sealed record ProductionMilestoneConfiguration
{
    public const long DefaultReviewInterval = 50;
    public const long DefaultReviewWindowExtension = 5;
    public const long DefaultSweepInterval = 250;

    public ProductionMilestoneConfiguration(
        long reviewInterval = DefaultReviewInterval,
        long reviewWindowExtension = DefaultReviewWindowExtension,
        long sweepInterval = DefaultSweepInterval)
    {
        if (reviewInterval <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(reviewInterval),
                "El intervalo de revisión debe ser positivo.");
        }

        if (reviewWindowExtension < 0 || reviewWindowExtension >= reviewInterval)
        {
            throw new ArgumentOutOfRangeException(
                nameof(reviewWindowExtension),
                "La extensión de la alerta debe estar entre cero y el intervalo de revisión exclusivo.");
        }

        if (sweepInterval <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(sweepInterval),
                "El intervalo de referencia de barrida debe ser positivo.");
        }

        ReviewInterval = reviewInterval;
        ReviewWindowExtension = reviewWindowExtension;
        SweepInterval = sweepInterval;
    }

    public long ReviewInterval { get; }

    public long ReviewWindowExtension { get; }

    public long SweepInterval { get; }
}

public sealed record ProductionReviewAlertState(
    long TotalCajuelas,
    long? ActiveReference,
    long? ActiveThrough,
    long NextReference)
{
    public bool IsActive => ActiveReference.HasValue;
}

public sealed record ProductionSweepProgressState(
    long TotalCajuelas,
    long? LastSweepCumulativeTotal,
    long NextSweepReference,
    bool IsSweepPending,
    long DisplaySegmentStart,
    long DisplayReference,
    long CajuelasInDisplaySegment);

public sealed class ProductionMilestoneService
{
    private readonly ProductionMilestoneConfiguration configuration;

    public ProductionMilestoneService(ProductionMilestoneConfiguration? configuration = null)
    {
        this.configuration = configuration ?? new ProductionMilestoneConfiguration();
    }

    public ProductionReviewAlertState CalculateReviewAlert(long totalCajuelas)
    {
        EnsureNonNegative(totalCajuelas, nameof(totalCajuelas));

        long completedReference = totalCajuelas / configuration.ReviewInterval
            * configuration.ReviewInterval;
        bool isActive = completedReference >= configuration.ReviewInterval &&
            totalCajuelas <= checked(completedReference + configuration.ReviewWindowExtension);
        long nextReference = checked(completedReference + configuration.ReviewInterval);

        return new ProductionReviewAlertState(
            totalCajuelas,
            isActive ? completedReference : null,
            isActive
                ? checked(completedReference + configuration.ReviewWindowExtension)
                : null,
            nextReference);
    }

    public ProductionSweepProgressState CalculateSweepProgress(
        long totalCajuelas,
        long? lastSweepCumulativeTotal = null)
    {
        EnsureNonNegative(totalCajuelas, nameof(totalCajuelas));
        if (lastSweepCumulativeTotal is < 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(lastSweepCumulativeTotal),
                "El acumulado de la última barrida no puede ser negativo.");
        }

        if (lastSweepCumulativeTotal > totalCajuelas)
        {
            throw new ArgumentOutOfRangeException(
                nameof(lastSweepCumulativeTotal),
                "La última barrida no puede superar el total acumulado actual.");
        }

        long baseline = lastSweepCumulativeTotal ?? 0;
        long nextSweepReference = checked(baseline + configuration.SweepInterval);
        long cajuelasSinceLastSweep = totalCajuelas - baseline;
        long completedDisplaySegments = cajuelasSinceLastSweep / configuration.SweepInterval;
        long displaySegmentStart = checked(
            baseline + completedDisplaySegments * configuration.SweepInterval);
        long displayReference = checked(displaySegmentStart + configuration.SweepInterval);

        return new ProductionSweepProgressState(
            totalCajuelas,
            lastSweepCumulativeTotal,
            nextSweepReference,
            totalCajuelas >= nextSweepReference,
            displaySegmentStart,
            displayReference,
            totalCajuelas - displaySegmentStart);
    }

    private static void EnsureNonNegative(long value, string parameterName)
    {
        if (value < 0)
        {
            throw new ArgumentOutOfRangeException(
                parameterName,
                "El total acumulado de cajuelas no puede ser negativo.");
        }
    }
}
