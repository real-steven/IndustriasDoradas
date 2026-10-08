namespace IndustriasDoradas.Desktop.Presentation;

public interface IUiDispatcher
{
    Task InvokeAsync(Func<Task> action);
}

public sealed class WpfUiDispatcher : IUiDispatcher
{
    private readonly SynchronizationContext? fallbackContext = SynchronizationContext.Current;

    public Task InvokeAsync(Func<Task> action)
    {
        ArgumentNullException.ThrowIfNull(action);

        System.Windows.Threading.Dispatcher? dispatcher = System.Windows.Application.Current?.Dispatcher;
        if (dispatcher is not null)
        {
            return dispatcher.CheckAccess()
                ? action()
                : dispatcher.InvokeAsync(action).Task.Unwrap();
        }

        if (fallbackContext is null || ReferenceEquals(SynchronizationContext.Current, fallbackContext))
        {
            return action();
        }

        var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fallbackContext.Post(async _ =>
        {
            try
            {
                await action().ConfigureAwait(true);
                completion.SetResult();
            }
            catch (Exception exception)
            {
                completion.SetException(exception);
            }
        }, null);
        return completion.Task;
    }
}
