using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using OpenCvSharp;

namespace IndustriasDoradas.Desktop.Infrastructure.Security;

public sealed class LocalFaceBiometricService : IBiometricVerificationService, IDisposable
{
    private const int EnrollmentPoseCount = 3;
    private const int EnrollmentStableFrames = 3;
    private const double MatchThreshold = 0.42;
    private const string ModelRevision = "48b10fa505aeb51fbd127fc60a5c660040e823b7";
    private const string DetectorFileName = "face_detection_yunet_2023mar.onnx";
    private const string RecognizerFileName = "face_recognition_sface_2021dec.onnx";
    private const string DetectorSha256 = "8F2383E4DD3CFBB4553EA8718107FC0423210DC964F9F4280604804ED2552FA4";
    private const string RecognizerSha256 = "0BA9FBFA01B5270C96627C4EF784DA859931E02F04419C829E83484087C34E79";
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("IndustriasDoradas.Biometrics.v1");

    private readonly string profileDirectory;
    private readonly string modelDirectory;
    private readonly IHttpClientFactory httpClientFactory;
    private readonly SemaphoreSlim cameraGate = new(1, 1);
    private FaceDetectorYN? detector;
    private FaceRecognizerSF? recognizer;
    private bool disposed;

    public LocalFaceBiometricService(
        ILocalDatabasePathProvider databasePathProvider,
        IHttpClientFactory httpClientFactory)
    {
        ArgumentNullException.ThrowIfNull(databasePathProvider);
        ArgumentNullException.ThrowIfNull(httpClientFactory);
        string stationDirectory = Path.GetDirectoryName(databasePathProvider.DatabasePath)
            ?? throw new InvalidOperationException("La ruta local de la estación no es válida.");
        profileDirectory = Path.Combine(stationDirectory, "biometric-profiles");
        modelDirectory = Path.Combine(stationDirectory, "biometric-models");
        this.httpClientFactory = httpClientFactory;
    }

    public async Task<bool> HasEnrollmentAsync(Guid profileId, CancellationToken cancellationToken = default)
    {
        try
        {
            BiometricProfile? profile = await LoadProfileAsync(profileId, cancellationToken).ConfigureAwait(false);
            return profile is not null &&
                profile.ProfileId == profileId &&
                profile.PoseEmbeddings is { Length: >= EnrollmentPoseCount };
        }
        catch (Exception exception) when (
            exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return false;
        }
    }

    public Task<BiometricOperationResult> EnrollAsync(
        Guid profileId,
        string displayName,
        IProgress<BiometricCameraFrame>? preview = null,
        IProgress<string>? status = null,
        CancellationToken cancellationToken = default) =>
        RunWithCameraAsync(async (capture, token) =>
        {
            status?.Report(EnrollmentPrompt(0, "Mantenga la cabeza recta."));
            List<float[]> samples = [];
            DateTimeOffset deadline = DateTimeOffset.UtcNow.AddSeconds(40);
            DateTimeOffset nextAnalysis = DateTimeOffset.MinValue;
            DateTimeOffset phaseReadyAt = DateTimeOffset.UtcNow.AddSeconds(1.2);
            int phase = 0;
            int stableFrames = 0;
            int firstTurnDirection = 0;
            using var frame = new Mat();

            while (DateTimeOffset.UtcNow < deadline && phase < EnrollmentPoseCount)
            {
                token.ThrowIfCancellationRequested();
                if (!capture.Read(frame) || frame.Empty())
                {
                    await Task.Delay(80, token).ConfigureAwait(false);
                    continue;
                }

                preview?.Report(ToPreviewFrame(frame));
                if (DateTimeOffset.UtcNow < nextAnalysis)
                {
                    await Task.Delay(35, token).ConfigureAwait(false);
                    continue;
                }

                nextAnalysis = DateTimeOffset.UtcNow.AddMilliseconds(450);
                FaceSample sample = ExtractFaceSample(frame);
                if (sample.Embedding is null)
                {
                    stableFrames = 0;
                    status?.Report(EnrollmentPrompt(phase, sample.Message));
                    continue;
                }

                if (DateTimeOffset.UtcNow < phaseReadyAt)
                {
                    status?.Report(EnrollmentPrompt(phase, "Prepárese y mantenga esa posición."));
                    continue;
                }

                bool expectedPose = phase switch
                {
                    0 => Math.Abs(sample.YawRatio) <= 0.12,
                    1 => Math.Abs(sample.YawRatio) >= 0.16,
                    2 => firstTurnDirection != 0 && sample.YawRatio * firstTurnDirection <= -0.16,
                    _ => false,
                };
                if (!expectedPose)
                {
                    stableFrames = 0;
                    string guidance = phase switch
                    {
                        0 => "Mire directamente al centro.",
                        1 => "Gire un poco más la cabeza hacia su derecha.",
                        _ => "Gire al lado contrario de la captura anterior.",
                    };
                    status?.Report(EnrollmentPrompt(phase, guidance));
                    continue;
                }

                stableFrames++;
                status?.Report(EnrollmentPrompt(
                    phase,
                    $"Posición detectada. Manténgala… {stableFrames} de {EnrollmentStableFrames}"));
                if (stableFrames < EnrollmentStableFrames) continue;

                samples.Add(sample.Embedding);
                if (phase == 1) firstTurnDirection = Math.Sign(sample.YawRatio);
                phase++;
                stableFrames = 0;
                phaseReadyAt = DateTimeOffset.UtcNow.AddSeconds(1.2);
                if (phase < EnrollmentPoseCount)
                    status?.Report(EnrollmentPrompt(phase, "Cambie de posición lentamente."));
            }

            if (samples.Count < EnrollmentPoseCount)
            {
                return new BiometricOperationResult(
                    false,
                    "FACE_NOT_CAPTURED",
                    "No se completaron las tres posiciones. Intente nuevamente con el rostro bien iluminado.");
            }

            float[] averaged = Normalize(Average(samples));
            await SaveProfileAsync(
                new BiometricProfile(
                    profileId,
                    displayName.Trim(),
                    averaged,
                    DateTimeOffset.UtcNow,
                    samples.Select(Normalize).ToArray()),
                token).ConfigureAwait(false);
            return new BiometricOperationResult(
                true,
                "ENROLLED",
                "Rostro registrado en este equipo. No se guardaron fotografías.");
        }, status, cancellationToken);

    public async Task<BiometricOperationResult> VerifyAsync(
        Guid profileId,
        IProgress<string>? status = null,
        CancellationToken cancellationToken = default)
    {
        BiometricProfile? profile = await LoadProfileAsync(profileId, cancellationToken).ConfigureAwait(false);
        float[][] enrolledEmbeddings = profile is null ? [] : GetEmbeddings(profile);
        if (profile is null || profile.ProfileId != profileId || enrolledEmbeddings.Length == 0)
        {
            return new BiometricOperationResult(
                false,
                "NOT_ENROLLED",
                "No hay un rostro registrado para esta sesión. Use el PIN para registrarlo.");
        }

        return await RunWithCameraAsync(async (capture, token) =>
        {
            status?.Report("Buscando rostro…");
            DateTimeOffset deadline = DateTimeOffset.UtcNow.AddSeconds(6);
            DateTimeOffset nextAnalysis = DateTimeOffset.MinValue;
            double bestSimilarity = -1;
            using var frame = new Mat();

            while (DateTimeOffset.UtcNow < deadline)
            {
                token.ThrowIfCancellationRequested();
                if (!capture.Read(frame) || frame.Empty())
                {
                    await Task.Delay(70, token).ConfigureAwait(false);
                    continue;
                }

                if (DateTimeOffset.UtcNow < nextAnalysis)
                {
                    await Task.Delay(35, token).ConfigureAwait(false);
                    continue;
                }

                nextAnalysis = DateTimeOffset.UtcNow.AddMilliseconds(350);
                FaceSample sample = ExtractFaceSample(frame);
                status?.Report(sample.Embedding is null ? sample.Message : "Verificando identidad…");
                if (sample.Embedding is null) continue;

                double similarity = enrolledEmbeddings.Max(
                    enrolled => CosineSimilarity(enrolled, sample.Embedding));
                bestSimilarity = Math.Max(bestSimilarity, similarity);
                if (similarity >= MatchThreshold)
                {
                    return new BiometricOperationResult(
                        true,
                        "MATCHED",
                        "Rostro reconocido. Activando acceso temporal…",
                        similarity);
                }
            }

            return new BiometricOperationResult(
                false,
                "NO_MATCH",
                bestSimilarity < 0
                    ? "No se detectó un rostro con claridad. Puede ingresar su PIN."
                    : "El rostro no coincide con el registro de este equipo. Puede ingresar su PIN.",
                bestSimilarity < 0 ? null : bestSimilarity);
        }, status, cancellationToken).ConfigureAwait(false);
    }

    private async Task<BiometricOperationResult> RunWithCameraAsync(
        Func<VideoCapture, CancellationToken, Task<BiometricOperationResult>> action,
        IProgress<string>? status,
        CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        if (!await cameraGate.WaitAsync(0, cancellationToken).ConfigureAwait(false))
        {
            return new BiometricOperationResult(false, "CAMERA_BUSY", "La cámara está siendo utilizada. Espere un momento o use el PIN.");
        }

        try
        {
            status?.Report("Preparando reconocimiento local…");
            await EnsureModelsAsync(cancellationToken).ConfigureAwait(false);
            return await Task.Run(async () =>
            {
                status?.Report("Encendiendo cámara…");
                using VideoCapture? capture = OpenCamera();
                if (capture is null)
                {
                    return new BiometricOperationResult(false, "CAMERA_UNAVAILABLE", "No se pudo abrir la cámara. Revise que esté conectada o use el PIN.");
                }

                try
                {
                    return await action(capture, cancellationToken).ConfigureAwait(false);
                }
                finally
                {
                    capture.Release();
                }
            }, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return new BiometricOperationResult(false, "CANCELLED", "Validación biométrica cancelada.");
        }
        catch (Exception exception) when (
            exception is InvalidOperationException or IOException or HttpRequestException or
                ExternalException or NullReferenceException or OpenCVException)
        {
            return new BiometricOperationResult(false, "BIOMETRIC_ERROR", $"No se pudo completar la validación biométrica. Use el PIN. Detalle: {exception.Message}");
        }
        finally
        {
            cameraGate.Release();
        }
    }

    private async Task EnsureModelsAsync(CancellationToken cancellationToken)
    {
        if (detector is not null && recognizer is not null) return;
        Directory.CreateDirectory(modelDirectory);
        string detectorPath = Path.Combine(modelDirectory, DetectorFileName);
        string recognizerPath = Path.Combine(modelDirectory, RecognizerFileName);
        await EnsureModelFileAsync(detectorPath, DetectorFileName, cancellationToken).ConfigureAwait(false);
        await EnsureModelFileAsync(recognizerPath, RecognizerFileName, cancellationToken).ConfigureAwait(false);

        detector ??= FaceDetectorYN.Create(detectorPath, string.Empty, new OpenCvSharp.Size(640, 480), 0.8f, 0.3f, 5);
        recognizer ??= FaceRecognizerSF.Create(recognizerPath, string.Empty);
    }

    private async Task EnsureModelFileAsync(string destination, string fileName, CancellationToken cancellationToken)
    {
        string expectedHash = fileName == DetectorFileName ? DetectorSha256 : RecognizerSha256;
        if (File.Exists(destination) &&
            await HasExpectedHashAsync(destination, expectedHash, cancellationToken).ConfigureAwait(false))
            return;

        string url = $"https://github.com/opencv/opencv_zoo/raw/{ModelRevision}/models/" +
            (fileName == DetectorFileName ? "face_detection_yunet/" : "face_recognition_sface/") + fileName;
        string temporary = $"{destination}.tmp";
        using HttpClient client = httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(3);
        await using Stream source = await client.GetStreamAsync(url, cancellationToken).ConfigureAwait(false);
        await using (FileStream target = File.Create(temporary))
        {
            await source.CopyToAsync(target, cancellationToken).ConfigureAwait(false);
        }
        if (!await HasExpectedHashAsync(temporary, expectedHash, cancellationToken).ConfigureAwait(false))
        {
            File.Delete(temporary);
            throw new InvalidOperationException("El modelo biométrico descargado no superó la verificación de integridad.");
        }
        File.Move(temporary, destination, true);
    }

    private static async Task<bool> HasExpectedHashAsync(
        string path,
        string expectedHash,
        CancellationToken cancellationToken)
    {
        await using FileStream stream = File.OpenRead(path);
        byte[] hash = await SHA256.HashDataAsync(stream, cancellationToken).ConfigureAwait(false);
        return string.Equals(Convert.ToHexString(hash), expectedHash, StringComparison.Ordinal);
    }

    private static VideoCapture? OpenCamera()
    {
        var capture = new VideoCapture();
        bool opened = capture.Open(0, VideoCaptureAPIs.DSHOW) || capture.Open(0, VideoCaptureAPIs.ANY);
        if (!opened)
        {
            capture.Dispose();
            return null;
        }

        capture.Set(VideoCaptureProperties.FrameWidth, 640);
        capture.Set(VideoCaptureProperties.FrameHeight, 480);
        capture.Set(VideoCaptureProperties.BufferSize, 1);
        return capture;
    }

    private FaceSample ExtractFaceSample(Mat source)
    {
        if (detector is null || recognizer is null)
            throw new InvalidOperationException("Los modelos biométricos no están disponibles.");

        detector.SetInputSize(source.Size());
        using var faces = new Mat();
        int count = detector.Detect(source, faces);
        if (count <= 0 || faces.Empty() || faces.Rows < 1 || faces.Cols < 15 || faces.Data == IntPtr.Zero)
            return new FaceSample(null, "Buscando rostro…");
        if (count > 1) return new FaceSample(null, "Debe aparecer una sola persona frente a la cámara.");

        float faceWidth = faces.At<float>(0, 2);
        float faceHeight = faces.At<float>(0, 3);
        if (faceWidth < source.Width * 0.18f || faceHeight < source.Height * 0.18f)
            return new FaceSample(null, "Acérquese un poco a la cámara.");

        using Mat faceRow = faces.Row(0);
        using var alignedFace = new Mat();
        using var feature = new Mat();
        recognizer.AlignCrop(source, faceRow, alignedFace);
        if (alignedFace.Empty() || alignedFace.Data == IntPtr.Zero)
            return new FaceSample(null, "No se pudo alinear el rostro. Mire al centro e inténtelo nuevamente.");
        recognizer.Feature(alignedFace, feature);
        if (feature.Empty() || feature.Data == IntPtr.Zero)
            return new FaceSample(null, "No se pudo obtener una referencia facial clara.");
        int length = checked((int)feature.Total());
        var embedding = new float[length];
        Marshal.Copy(feature.Data, embedding, 0, length);
        float firstEyeX = faces.At<float>(0, 4);
        float secondEyeX = faces.At<float>(0, 6);
        float noseX = faces.At<float>(0, 8);
        double eyeDistance = Math.Abs(secondEyeX - firstEyeX);
        double eyeCenter = (firstEyeX + secondEyeX) / 2d;
        double yawRatio = eyeDistance <= double.Epsilon ? 0 : (noseX - eyeCenter) / eyeDistance;
        return new FaceSample(Normalize(embedding), "Rostro detectado.", yawRatio);
    }

    private static BiometricCameraFrame ToPreviewFrame(Mat source)
    {
        using var bgra = new Mat();
        Cv2.CvtColor(source, bgra, ColorConversionCodes.BGR2BGRA);
        int length = checked((int)(bgra.Total() * bgra.ElemSize()));
        byte[] pixels = new byte[length];
        Marshal.Copy(bgra.Data, pixels, 0, length);
        return new BiometricCameraFrame(pixels, bgra.Width, bgra.Height, checked((int)bgra.Step()));
    }

    private async Task SaveProfileAsync(BiometricProfile profile, CancellationToken cancellationToken)
    {
        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(profile);
        try
        {
            byte[] encrypted = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser);
            Directory.CreateDirectory(profileDirectory);
            string profilePath = GetProfilePath(profile.ProfileId);
            string temporary = $"{profilePath}.tmp";
            await File.WriteAllBytesAsync(temporary, encrypted, cancellationToken).ConfigureAwait(false);
            File.Move(temporary, profilePath, true);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plain);
        }
    }

    private async Task<BiometricProfile?> LoadProfileAsync(
        Guid profileId,
        CancellationToken cancellationToken)
    {
        string profilePath = GetProfilePath(profileId);
        if (!File.Exists(profilePath)) return null;
        byte[] encrypted = await File.ReadAllBytesAsync(profilePath, cancellationToken).ConfigureAwait(false);
        byte[] plain;
        try
        {
            plain = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
        }
        catch (CryptographicException)
        {
            return null;
        }

        try { return JsonSerializer.Deserialize<BiometricProfile>(plain); }
        catch (JsonException) { return null; }
        finally
        {
            CryptographicOperations.ZeroMemory(plain);
        }
    }

    private string GetProfilePath(Guid profileId) =>
        Path.Combine(profileDirectory, $"{profileId:N}.bin");

    private static float[] Average(List<float[]> values)
    {
        int length = values[0].Length;
        var result = new float[length];
        foreach (float[] value in values)
        {
            if (value.Length != length)
                throw new InvalidOperationException("Las plantillas biométricas no tienen el mismo formato.");
            for (int index = 0; index < length; index++) result[index] += value[index];
        }

        for (int index = 0; index < length; index++) result[index] /= values.Count;
        return result;
    }

    private static float[][] GetEmbeddings(BiometricProfile profile)
    {
        if (profile.PoseEmbeddings is { Length: > 0 }) return profile.PoseEmbeddings;
        return profile.Embedding.Length > 0 ? [profile.Embedding] : [];
    }

    private static string EnrollmentPrompt(int phase, string guidance) => phase switch
    {
        0 => $"Paso 1 de 3 · Mire al frente. {guidance}",
        1 => $"Paso 2 de 3 · Gire ligeramente la cabeza hacia su derecha. {guidance}",
        2 => $"Paso 3 de 3 · Ahora gire ligeramente hacia su izquierda. {guidance}",
        _ => guidance,
    };

    private static float[] Normalize(float[] value)
    {
        double magnitude = Math.Sqrt(value.Sum(item => item * item));
        if (magnitude <= double.Epsilon) return value;
        var normalized = new float[value.Length];
        for (int index = 0; index < value.Length; index++) normalized[index] = (float)(value[index] / magnitude);
        return normalized;
    }

    private static double CosineSimilarity(float[] left, float[] right)
    {
        if (left.Length != right.Length) return -1;
        double dot = 0;
        double leftMagnitude = 0;
        double rightMagnitude = 0;
        for (int index = 0; index < left.Length; index++)
        {
            dot += left[index] * right[index];
            leftMagnitude += left[index] * left[index];
            rightMagnitude += right[index] * right[index];
        }

        double divisor = Math.Sqrt(leftMagnitude) * Math.Sqrt(rightMagnitude);
        return divisor <= double.Epsilon ? -1 : dot / divisor;
    }

    private void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(disposed, this);

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        detector?.Dispose();
        recognizer?.Dispose();
        cameraGate.Dispose();
        GC.SuppressFinalize(this);
    }

    private sealed record BiometricProfile(
        Guid ProfileId,
        string DisplayName,
        float[] Embedding,
        DateTimeOffset EnrolledAt,
        float[][]? PoseEmbeddings = null);

    private sealed record FaceSample(float[]? Embedding, string Message, double YawRatio = 0);
}
