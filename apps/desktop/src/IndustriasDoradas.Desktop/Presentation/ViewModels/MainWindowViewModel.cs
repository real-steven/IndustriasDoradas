using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class MainWindowViewModel : ObservableObject
{
    private object currentPage;

    public MainWindowViewModel(HomeViewModel home, DiagnosticsViewModel diagnostics)
        : this(home, diagnostics, null, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station)
        : this(home, diagnostics, station, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        OperationViewModel? operation)
    {
        Home = home;
        Diagnostics = diagnostics;
        Station = station;
        Operation = operation;
        currentPage = operation ?? (object?)station ?? home;
        ShowHomeCommand = new RelayCommand(() => CurrentPage = Home);
        ShowDiagnosticsCommand = new RelayCommand(() => CurrentPage = Diagnostics);
        ShowStationCommand = new RelayCommand(
            () => CurrentPage = Station!,
            () => Station is not null);
        ShowOperationCommand = new RelayCommand(
            () => CurrentPage = Operation!,
            () => Operation is not null);
    }

    public HomeViewModel Home { get; }

    public DiagnosticsViewModel Diagnostics { get; }
    public StationViewModel? Station { get; }
    public OperationViewModel? Operation { get; }

    public object CurrentPage
    {
        get => currentPage;
        private set => SetProperty(ref currentPage, value);
    }

    public IRelayCommand ShowHomeCommand { get; }

    public IRelayCommand ShowDiagnosticsCommand { get; }
    public IRelayCommand ShowStationCommand { get; }
    public IRelayCommand ShowOperationCommand { get; }

    public async Task InitializeAsync()
    {
        if (Operation is not null)
        {
            await Operation.InitializeAsync();
        }

        if (Station is not null)
        {
            await Station.InitializeAsync();
        }

        await Diagnostics.RefreshAsync();
    }
}
