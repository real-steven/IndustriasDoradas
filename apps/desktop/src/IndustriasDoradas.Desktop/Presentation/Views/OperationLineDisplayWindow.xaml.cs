using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public sealed class OperationLineDisplayContext : ObservableObject
{
    private OperationLinePanelViewModel line;
    private bool isLineAvailable = true;

    public OperationLineDisplayContext(
        OperationViewModel operation,
        OperationLinePanelViewModel line)
    {
        Operation = operation;
        this.line = line;
        LineId = line.LineId;
    }

    public Guid LineId { get; }
    public OperationViewModel Operation { get; }
    public OperationLinePanelViewModel Line
    {
        get => line;
        private set => SetProperty(ref line, value);
    }

    public bool IsLineAvailable
    {
        get => isLineAvailable;
        private set => SetProperty(ref isLineAvailable, value);
    }

    public void Synchronize()
    {
        OperationLinePanelViewModel? current = Operation.Lines.FirstOrDefault(item => item.LineId == LineId);
        IsLineAvailable = current is not null;
        if (current is not null) Line = current;
    }
}

public partial class OperationLineDisplayWindow : Window
{
    private OperationLineDisplayContext? context;
    private readonly DispatcherTimer refreshTimer;
    private bool isFullScreen;
    private WindowState previousState;
    private WindowStyle previousStyle;
    private ResizeMode previousResizeMode;

    public OperationLineDisplayWindow()
    {
        InitializeComponent();
        refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        refreshTimer.Tick += OnRefreshTick;
        Loaded += (_, _) => refreshTimer.Start();
        Closed += (_, _) => refreshTimer.Stop();
        PreviewKeyDown += OnPreviewKeyDown;
    }

    public OperationLineDisplayWindow(
        OperationViewModel operation,
        OperationLinePanelViewModel line) : this()
    {
        context = new OperationLineDisplayContext(operation, line);
        DataContext = context;
        Title = $"{line.LineName} · Industrias Doradas";
    }

    public Guid LineId => context?.LineId ?? Guid.Empty;

    private async void OnRefreshTick(object? sender, EventArgs e)
    {
        if (context is null) return;
        await context.Operation.RefreshFromExternalChangeAsync();
        context.Synchronize();
    }

    private void OnToggleFullScreen(object sender, RoutedEventArgs e)
    {
        if (isFullScreen)
        {
            WindowStyle = previousStyle;
            ResizeMode = previousResizeMode;
            WindowState = previousState;
            isFullScreen = false;
            return;
        }

        previousState = WindowState;
        previousStyle = WindowStyle;
        previousResizeMode = ResizeMode;
        WindowState = WindowState.Normal;
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        WindowState = WindowState.Maximized;
        isFullScreen = true;
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key is Key.F11)
        {
            OnToggleFullScreen(sender, e);
            e.Handled = true;
        }
        else if (e.Key is Key.Escape && isFullScreen)
        {
            OnToggleFullScreen(sender, e);
            e.Handled = true;
        }
    }
}
