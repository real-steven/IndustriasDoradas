using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Application;

public sealed record InitialSynchronizationProgress(
    int Percent,
    bool IsIndeterminate,
    string Message);

public sealed record InitialSynchronizationResult(
    bool CanContinue,
    bool IsCurrent,
    int DownloadedPages,
    string Message);

public sealed class InitialSynchronizationCoordinator(
    OutboxSyncProcessor outbox,
    IncrementalPullProcessor pull,
    ILocalSyncChangeRepository localChanges,
    ILocalSynchronizationReadiness readiness,
    IOptions<SyncOptions> syncOptions)
{
    private readonly TimeSpan timeout = TimeSpan.FromSeconds(
        syncOptions.Value.InitialSyncTimeoutSeconds);

    public async Task<bool> HasUsableLocalCopyAsync(
        CancellationToken cancellationToken = default) =>
        !string.IsNullOrWhiteSpace(await localChanges.GetCursorAsync(cancellationToken)
            .ConfigureAwait(false));

    public async Task<InitialSynchronizationResult> SynchronizeAsync(
        IProgress<InitialSynchronizationProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        string? previousCursor = await localChanges.GetCursorAsync(cancellationToken)
            .ConfigureAwait(false);
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);
        CancellationToken synchronizationToken = timeoutSource.Token;

        try
        {
            progress?.Report(new InitialSynchronizationProgress(
                30,
                false,
                "Enviando cambios locales pendientes…"));
            int uploadedBatches = 0;
            LocalSynchronizationQueueState queue;
            while (true)
            {
                bool processed = await outbox.ProcessOnceAsync(synchronizationToken)
                    .ConfigureAwait(false);
                queue = await readiness.ReadAsync(synchronizationToken).ConfigureAwait(false);
                if (processed) uploadedBatches++;
                progress?.Report(new InitialSynchronizationProgress(
                    Math.Min(48, 30 + uploadedBatches * 3),
                    false,
                    queue.PendingCount == 0
                        ? "Cambios locales enviados."
                        : $"Enviando cambios locales · {queue.PendingCount} pendientes…"));
                if (queue.PendingCount == 0) break;
                if (!processed) break;
            }

            progress?.Report(new InitialSynchronizationProgress(
                55,
                true,
                "Descargando los datos más recientes de la planta…"));
            int downloadedPages = 0;
            bool hasMore;
            do
            {
                hasMore = await pull.ProcessOnceAsync(synchronizationToken).ConfigureAwait(false);
                downloadedPages++;
                progress?.Report(new InitialSynchronizationProgress(
                    Math.Min(92, 55 + downloadedPages * 4),
                    hasMore,
                    hasMore
                        ? $"Aplicando datos remotos · bloque {downloadedPages}…"
                        : "Comprobando la información sincronizada…"));
            }
            while (hasMore);

            string? currentCursor = await localChanges.GetCursorAsync(synchronizationToken)
                .ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(currentCursor))
            {
                return new InitialSynchronizationResult(
                    false,
                    false,
                    downloadedPages,
                    "Esta instalación todavía no tiene una copia local completa. Conéctese a Internet y reintente.");
            }

            queue = await readiness.ReadAsync(synchronizationToken).ConfigureAwait(false);
            if (queue.PendingCount > 0)
            {
                return new InitialSynchronizationResult(
                    true,
                    false,
                    downloadedPages,
                    $"La estación está disponible. {queue.PendingCount} cambios locales siguen pendientes " +
                    "y se enviarán en segundo plano; puede revisarlos en Estado.");
            }

            progress?.Report(new InitialSynchronizationProgress(
                100,
                false,
                "Datos locales actualizados correctamente."));
            string message = queue.FailedReviewCount == 0
                ? "La estación está sincronizada con los datos centrales."
                : "Los datos centrales están actualizados. " +
                  $"{queue.FailedReviewCount} cambios locales rechazados quedaron disponibles en Estado para revisión.";
            return new InitialSynchronizationResult(
                true,
                true,
                downloadedPages,
                message);
        }
        catch (SyncTransportException)
        {
            return OfflineResult(previousCursor);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return OfflineResult(previousCursor);
        }
    }

    private static InitialSynchronizationResult OfflineResult(string? previousCursor)
    {
        bool hasLocalData = !string.IsNullOrWhiteSpace(previousCursor);
        return new InitialSynchronizationResult(
            hasLocalData,
            false,
            0,
            hasLocalData
                ? "No fue posible conectar con el sistema central. Se continuará con la última copia local válida."
                : "No fue posible descargar la copia inicial. Revise la conexión y vuelva a intentarlo.");
    }
}
