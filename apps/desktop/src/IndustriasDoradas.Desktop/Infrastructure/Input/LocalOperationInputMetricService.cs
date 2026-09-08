using System.Threading.Channels;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Infrastructure.Input;

public sealed class LocalOperationInputMetricService : BackgroundService, IOperationInputMetrics
{
    private readonly ILocalOperationInputMetricStore store;
    private readonly bool enabled;
    private readonly Channel<LocalOperationInputMetric> queue;

    public LocalOperationInputMetricService(
        ILocalOperationInputMetricStore store,
        IOptions<OperationSafetyOptions> options)
    {
        this.store = store;
        enabled = options.Value.MetricsEnabled;
        queue = Channel.CreateBounded<LocalOperationInputMetric>(new BoundedChannelOptions(options.Value.MetricsQueueCapacity)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.DropOldest,
        });
    }

    public void Record(LocalOperationInputMetric metric)
    {
        if (enabled) queue.Writer.TryWrite(metric);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (LocalOperationInputMetric metric in queue.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await store.AppendAsync(metric, stoppingToken).ConfigureAwait(false);
                }
                catch when (!stoppingToken.IsCancellationRequested)
                {
                    // Las métricas nunca deben interrumpir ni ralentizar la operación principal.
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
