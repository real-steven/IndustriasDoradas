using System.Windows;
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
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;
        await viewModel.InitializeAsync();
    }
}
