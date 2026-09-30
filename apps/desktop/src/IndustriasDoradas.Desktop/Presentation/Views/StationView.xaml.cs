using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class StationView : UserControl
{
    private StationConfirmation confirmation;

    public StationView()
    {
        InitializeComponent();
        PreviewKeyDown += OnActivity;
        PreviewMouseDown += OnActivity;
    }

    private StationViewModel? ViewModel => DataContext as StationViewModel;
    private void OnActivity(object sender, InputEventArgs e) => ViewModel?.RecordActivity();

    private async void OnRequestStart(object sender, RoutedEventArgs e)
    {
        if (ViewModel is null || !ViewModel.PrepareLineCommand.CanExecute(null)) return;
        await ViewModel.PrepareLineCommand.ExecuteAsync(null);
        if (!ViewModel.ConfirmLineCommand.CanExecute(null)) return;
        ShowConfirmation(
            StationConfirmation.Start,
            "Confirmar preparación de línea",
            $"Revise los datos antes de iniciar el cargamento. {ViewModel.PreparationSummary}",
            "SÍ, PREPARAR LÍNEA",
            destructive: false);
    }

    private async void OnRequestRelief(object sender, RoutedEventArgs e)
    {
        if (ViewModel is null || !ViewModel.PrepareReliefCommand.CanExecute(null)) return;
        await ViewModel.PrepareReliefCommand.ExecuteAsync(null);
        if (!ViewModel.ConfirmReliefCommand.CanExecute(null)) return;
        ShowConfirmation(
            StationConfirmation.Relief,
            "Confirmar cambio de responsable",
            ViewModel.ManagementSummary,
            "SÍ, CAMBIAR RESPONSABLE",
            destructive: false);
    }

    private async void OnRequestCompletion(object sender, RoutedEventArgs e)
    {
        if (ViewModel is null || !ViewModel.PrepareCompletionCommand.CanExecute(null)) return;
        await ViewModel.PrepareCompletionCommand.ExecuteAsync(null);
        if (!ViewModel.ConfirmCompletionCommand.CanExecute(null)) return;
        ShowConfirmation(
            StationConfirmation.Completion,
            "¿Finalizar este cargamento?",
            "La línea dejará de aceptar cajuelas para este cargamento. El historial registrado se conservará.",
            "SÍ, FINALIZAR CARGAMENTO",
            destructive: true);
    }

    private async void OnConfirmAction(object sender, RoutedEventArgs e)
    {
        if (ViewModel is null) return;
        switch (confirmation)
        {
            case StationConfirmation.Start:
                await ViewModel.ConfirmLineCommand.ExecuteAsync(null);
                break;
            case StationConfirmation.Relief:
                await ViewModel.ConfirmReliefCommand.ExecuteAsync(null);
                break;
            case StationConfirmation.Completion:
                await ViewModel.ConfirmCompletionCommand.ExecuteAsync(null);
                break;
        }
        HideConfirmation();
    }

    private void OnCancelConfirmation(object sender, RoutedEventArgs e)
    {
        if (ViewModel is not null)
        {
            if (confirmation == StationConfirmation.Start)
            {
                ViewModel.CancelPreparationCommand.Execute(null);
            }
            else
            {
                ViewModel.CancelManagementChangeCommand.Execute(null);
            }
        }
        HideConfirmation();
    }

    private void ShowConfirmation(
        StationConfirmation requested,
        string title,
        string message,
        string confirmationText,
        bool destructive)
    {
        confirmation = requested;
        ConfirmationTitle.Text = title;
        ConfirmationMessage.Text = message;
        ConfirmationButton.Content = confirmationText;
        ConfirmationButton.Background = new SolidColorBrush(
            (Color)ColorConverter.ConvertFromString(destructive ? "#FFF1F1" : "#E7F7ED"));
        ConfirmationButton.BorderBrush = new SolidColorBrush(
            (Color)ColorConverter.ConvertFromString(destructive ? "#E7AFB3" : "#A8D6BA"));
        ConfirmationButton.Foreground = new SolidColorBrush(
            (Color)ColorConverter.ConvertFromString(destructive ? "#A2252C" : "#176B3B"));
        ConfirmationOverlay.Visibility = Visibility.Visible;
    }

    private void HideConfirmation()
    {
        confirmation = StationConfirmation.None;
        ConfirmationOverlay.Visibility = Visibility.Collapsed;
    }

    private enum StationConfirmation
    {
        None,
        Start,
        Relief,
        Completion,
    }
}
