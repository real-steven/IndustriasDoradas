using System.Windows;
using System.Windows.Controls;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class DiagnosticsView : UserControl
{
    public DiagnosticsView()
    {
        InitializeComponent();
    }

    private async void OnRequestDiscardFailure(object sender, RoutedEventArgs e)
    {
        if (DataContext is not DiagnosticsViewModel viewModel ||
            sender is not Button { DataContext: SyncFailureReviewItemViewModel item } ||
            item.Source is not SyncFailureDiagnostic failure ||
            !viewModel.DiscardFailureCommand.CanExecute(failure))
            return;

        MessageBoxResult answer = MessageBox.Show(
            "Este evento dejará de enviarse al sistema central. La decisión quedará registrada en este equipo. ¿Desea descartarlo?",
            "Descartar dato pendiente",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning);
        if (answer == MessageBoxResult.Yes)
        {
            await viewModel.DiscardFailureCommand.ExecuteAsync(failure);
        }
    }

    private async void OnRequestDiscardSelectedFailures(object sender, RoutedEventArgs e)
    {
        if (DataContext is not DiagnosticsViewModel viewModel ||
            !viewModel.DiscardSelectedFailuresCommand.CanExecute(null))
            return;

        int count = viewModel.FailureSelections.Count(item => item.IsSelected);
        MessageBoxResult answer = MessageBox.Show(
            $"Se descartarán {count} dato(s) seleccionados de la cola de envío. Las decisiones quedarán registradas en este equipo. ¿Desea continuar?",
            "Descartar datos seleccionados",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning);
        if (answer == MessageBoxResult.Yes)
        {
            await viewModel.DiscardSelectedFailuresCommand.ExecuteAsync(null);
        }
    }
}
