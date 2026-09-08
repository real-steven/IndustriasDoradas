using System.Windows;
using System.Windows.Input;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation;

public partial class MainWindow : Window
{
    private readonly MainWindowViewModel viewModel;

    public MainWindow(MainWindowViewModel viewModel)
    {
        InitializeComponent();
        this.viewModel = viewModel;
        DataContext = viewModel;
        Loaded += OnLoaded;
        PreviewKeyDown += OnActivity;
        PreviewMouseDown += OnActivity;
        PreviewTouchDown += OnActivity;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;
        await viewModel.InitializeAsync();
    }

    private void OnActivity(object? sender, InputEventArgs e) => viewModel.RecordActivity();
}
