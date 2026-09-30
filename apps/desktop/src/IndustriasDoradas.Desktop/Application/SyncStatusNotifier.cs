using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Application;

public sealed class SyncStatusNotifier : ISyncStatusNotifier
{
    public event EventHandler<SyncStatusNotification>? Changed;

    public void Notify(SyncStatusNotification notification) => Changed?.Invoke(this, notification);
}
