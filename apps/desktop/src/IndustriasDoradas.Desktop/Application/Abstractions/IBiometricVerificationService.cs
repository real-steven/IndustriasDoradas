namespace IndustriasDoradas.Desktop.Application.Abstractions;

public sealed record BiometricCameraFrame(
    byte[] BgraPixels,
    int Width,
    int Height,
    int Stride);

public sealed record BiometricOperationResult(
    bool Succeeded,
    string Code,
    string Message,
    double? Similarity = null);

public interface IBiometricVerificationService
{
    Task<bool> HasEnrollmentAsync(
        Guid profileId,
        CancellationToken cancellationToken = default);

    Task<BiometricOperationResult> EnrollAsync(
        Guid profileId,
        string displayName,
        IProgress<BiometricCameraFrame>? preview = null,
        IProgress<string>? status = null,
        CancellationToken cancellationToken = default);

    Task<BiometricOperationResult> VerifyAsync(
        Guid profileId,
        IProgress<string>? status = null,
        CancellationToken cancellationToken = default);
}
