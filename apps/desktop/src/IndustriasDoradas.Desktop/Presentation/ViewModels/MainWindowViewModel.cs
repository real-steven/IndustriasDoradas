using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.IO;
using System.ComponentModel;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class MainWindowViewModel : ObservableObject, IDisposable
{
    private object currentPage;
    private readonly ISyncStatusNotifier? syncStatusNotifier;
    private readonly SynchronizationContext? uiContext;
    private bool isRefreshingAfterSync;

    public MainWindowViewModel(HomeViewModel home, DiagnosticsViewModel diagnostics)
        : this(home, diagnostics, null, null, null, null, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station)
        : this(home, diagnostics, station, null, null, null, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        OperationViewModel? operation)
        : this(home, diagnostics, station, operation, null, null, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        OperationViewModel? operation,
        AuditViewModel? audit)
        : this(home, diagnostics, station, operation, audit, null, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        OperationViewModel? operation,
        AuditViewModel? audit,
        SettingsViewModel? settings)
        : this(home, diagnostics, station, operation, audit, settings, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        OperationViewModel? operation,
        AuditViewModel? audit,
        SettingsViewModel? settings,
        ISyncStatusNotifier? syncStatusNotifier)
    {
        Home = home;
        Diagnostics = diagnostics;
        Station = station;
        Operation = operation;
        Audit = audit;
        Settings = settings;
        this.syncStatusNotifier = syncStatusNotifier;
        uiContext = SynchronizationContext.Current;
        currentPage = operation ?? (object?)station ?? home;
        ShowHomeCommand = new RelayCommand(() => CurrentPage = Home);
        ShowDiagnosticsCommand = new RelayCommand(
            () => CurrentPage = Diagnostics,
            CanShowDiagnostics);
        ShowAuditCommand = new AsyncRelayCommand(
            ShowAuditAsync,
            CanShowAudit);
        ShowAuditCorrectionsCommand = new AsyncRelayCommand(
            ShowAuditCorrectionsAsync,
            CanShowAuditCorrections);
        ShowSettingsCommand = new RelayCommand(
            () => CurrentPage = Settings!,
            CanShowSettings);
        ShowStationCommand = new RelayCommand(
            () => CurrentPage = Station!,
            () => Station is not null);
        ShowOperationCommand = new AsyncRelayCommand(
            ShowOperationAsync,
            () => Operation is not null);
        if (Station is not null) Station.PropertyChanged += OnStationPropertyChanged;
        Diagnostics.PropertyChanged += OnDiagnosticsPropertyChanged;
        if (syncStatusNotifier is not null)
        {
            syncStatusNotifier.Changed += OnSyncStatusChanged;
        }
    }

    public HomeViewModel Home { get; }

    public DiagnosticsViewModel Diagnostics { get; }
    public StationViewModel? Station { get; }
    public OperationViewModel? Operation { get; }
    public AuditViewModel? Audit { get; }
    public SettingsViewModel? Settings { get; }

    public object CurrentPage
    {
        get => currentPage;
        private set
        {
            if (!SetProperty(ref currentPage, value)) return;
            OnPropertyChanged(nameof(IsHomePage));
            OnPropertyChanged(nameof(IsOperationPage));
            OnPropertyChanged(nameof(IsStationPage));
            OnPropertyChanged(nameof(IsAuditPage));
            OnPropertyChanged(nameof(IsDiagnosticsPage));
            OnPropertyChanged(nameof(IsSettingsPage));
            OnPropertyChanged(nameof(CurrentPageTitle));
        }
    }

    public bool IsStationOpen => Station?.IsStationOpen ?? true;
    public bool IsApplicationUnlocked => Station?.IsApplicationUnlocked ?? true;
    public bool IsPlantManager => Station?.IsPlantManager ?? false;
    public bool IsHomePage => ReferenceEquals(CurrentPage, Home);
    public bool IsOperationPage => ReferenceEquals(CurrentPage, Operation);
    public bool IsStationPage => ReferenceEquals(CurrentPage, Station);
    public bool IsAuditPage => ReferenceEquals(CurrentPage, Audit);
    public bool IsDiagnosticsPage => ReferenceEquals(CurrentPage, Diagnostics);
    public bool IsSettingsPage => ReferenceEquals(CurrentPage, Settings);
    public string CurrentPageTitle => CurrentPage switch
    {
        OperationViewModel => "Modo Operación",
        StationViewModel => "Estación",
        AuditViewModel => "Auditoría",
        SettingsViewModel => "Configuración",
        DiagnosticsViewModel => "Diagnóstico",
        _ => "Inicio",
    };

    public IRelayCommand ShowHomeCommand { get; }

    public IRelayCommand ShowDiagnosticsCommand { get; }
    public IAsyncRelayCommand ShowAuditCommand { get; }
    public IAsyncRelayCommand ShowAuditCorrectionsCommand { get; }
    public IRelayCommand ShowSettingsCommand { get; }
    public IRelayCommand ShowStationCommand { get; }
    public IRelayCommand ShowOperationCommand { get; }
    public bool HasCorrectionNotification => Diagnostics.HasCorrections &&
        (Station is null || Station.IsPlantManager);
    public string CorrectionNotification => Diagnostics.CorrectionNotification;

    public async Task InitializeAsync()
    {
        try
        {
            if (Operation is not null)
            {
                await Operation.InitializeAsync();
            }

            if (Station is not null)
            {
                await Station.InitializeAsync();
            }

            if (Audit is not null)
            {
                await Audit.InitializeAsync();
            }
        }
        catch (Exception exception) when (
            exception is IOException or SqliteException or InvalidOperationException)
        {
            CurrentPage = Diagnostics;
        }

        await Diagnostics.RefreshAsync();
    }

    public void RecordActivity() => Station?.RecordActivity();

    private static bool CanShowDiagnostics() => true;
    private bool CanShowAudit() => Audit is not null;
    private bool CanShowAuditCorrections() => Audit is not null &&
        (Station is null || Station.IsPlantManager);
    private bool CanShowSettings() => Settings is not null &&
        (Station is null || Station.IsPlantManager);

    private async Task ShowOperationAsync()
    {
        if (Operation is null) return;
        await Operation.RefreshAsync();
        CurrentPage = Operation;
    }

    private async Task ShowAuditAsync()
    {
        if (Audit is null) return;
        await Audit.RefreshAsync();
        CurrentPage = Audit;
    }

    private async Task ShowAuditCorrectionsAsync()
    {
        if (Audit is null) return;
        await Audit.RefreshAsync();
        Audit.SelectCategoryCommand.Execute(AuditCategory.Corrections);
        CurrentPage = Audit;
    }

    private void OnStationPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(StationViewModel.IsStationOpen))
        {
            OnPropertyChanged(nameof(IsStationOpen));
            if (Station?.IsStationOpen == true)
            {
                CurrentPage = Home;
            }
            return;
        }

        if (e.PropertyName == nameof(StationViewModel.IsApplicationUnlocked))
        {
            OnPropertyChanged(nameof(IsApplicationUnlocked));
            if (Station?.IsApplicationUnlocked == true)
            {
                CurrentPage = Home;
            }
            return;
        }

        if (e.PropertyName == nameof(StationViewModel.Mode))
        {
            OnPropertyChanged(nameof(IsPlantManager));
            ShowDiagnosticsCommand.NotifyCanExecuteChanged();
            ShowAuditCommand.NotifyCanExecuteChanged();
            ShowAuditCorrectionsCommand.NotifyCanExecuteChanged();
            ShowSettingsCommand.NotifyCanExecuteChanged();
            OnPropertyChanged(nameof(HasCorrectionNotification));
            if (!CanShowSettings() && ReferenceEquals(CurrentPage, Settings))
            {
                CurrentPage = Operation ?? (object)Home;
            }
        }
    }

    private void OnDiagnosticsPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName is not (nameof(DiagnosticsViewModel.HasCorrections) or
            nameof(DiagnosticsViewModel.CorrectionNotification))) return;
        OnPropertyChanged(nameof(HasCorrectionNotification));
        OnPropertyChanged(nameof(CorrectionNotification));
    }

    private void OnSyncStatusChanged(object? sender, SyncStatusNotification notification)
    {
        if (!notification.HasDataChanges) return;
        if (uiContext is null)
        {
            _ = RefreshVisibleDataAfterSyncAsync();
            return;
        }
        uiContext.Post(static state =>
        {
            _ = ((MainWindowViewModel)state!).RefreshVisibleDataAfterSyncAsync();
        }, this);
    }

    private async Task RefreshVisibleDataAfterSyncAsync()
    {
        if (isRefreshingAfterSync) return;
        isRefreshingAfterSync = true;
        try
        {
            if (ReferenceEquals(CurrentPage, Audit) && Audit is not null)
            {
                await Audit.RefreshAsync();
            }
            else if (ReferenceEquals(CurrentPage, Operation) && Operation is not null)
            {
                await Operation.RefreshAsync();
            }
        }
        catch (Exception exception) when (
            exception is IOException or SqliteException or InvalidOperationException)
        {
            // El siguiente cambio o la apertura manual de la vista vuelve a consultar SQLite.
        }
        finally
        {
            isRefreshingAfterSync = false;
        }
    }

    public void Dispose()
    {
        if (Station is not null) Station.PropertyChanged -= OnStationPropertyChanged;
        Diagnostics.PropertyChanged -= OnDiagnosticsPropertyChanged;
        if (syncStatusNotifier is not null)
        {
            syncStatusNotifier.Changed -= OnSyncStatusChanged;
        }
        GC.SuppressFinalize(this);
    }
}
