using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Infrastructure.Station;

public sealed class NoopEvidenceCapture : IElevationEvidenceCapture
{
    public Task<EvidenceCaptureResult> CaptureAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(new EvidenceCaptureResult(false));
}
