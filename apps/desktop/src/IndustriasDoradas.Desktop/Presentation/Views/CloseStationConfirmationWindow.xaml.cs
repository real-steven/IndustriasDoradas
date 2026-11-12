using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

/// <summary>
/// Confirmación propia de «Cerrar estación». No hay botón predeterminado: Enter solo actúa
/// sobre el botón que tiene el foco, que al abrir es Cancelar. Esc cancela.
/// </summary>
public partial class CloseStationConfirmationWindow : Window
{
    private bool completed;

    public CloseStationConfirmationWindow()
    {
        InitializeComponent();
        PreviewKeyDown += OnPreviewKeyDown;
        DataContextChanged += OnDataContextChanged;
    }

    private CloseStationConfirmationViewModel? ViewModel => DataContext as CloseStationConfirmationViewModel;

    /// <summary>Esc cancela; durante el cierre se ignora para no dejarlo a medias.</summary>
    public bool HandleKey(Key key)
    {
        if (key != Key.Escape) return false;
        ViewModel?.TryCancel();
        return true;
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        // La X o Alt+F4 equivalen a Cancelar; mientras se cierra la estación no se permite.
        if (!completed && ViewModel is { } viewModel)
        {
            // Se marca antes de cancelar para que OnCancelled no vuelva a llamar a Close.
            completed = true;
            if (!viewModel.TryCancel())
            {
                completed = false;
                e.Cancel = true;
            }
        }
        base.OnClosing(e);
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (HandleKey(e.Key)) e.Handled = true;
    }

    private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (e.OldValue is CloseStationConfirmationViewModel previous)
        {
            previous.Completed -= OnCompleted;
            previous.Cancelled -= OnCancelled;
        }
        if (e.NewValue is CloseStationConfirmationViewModel current)
        {
            current.Completed += OnCompleted;
            current.Cancelled += OnCancelled;
        }
    }

    private void OnCompleted(object? sender, EventArgs e) => Finish();

    private void OnCancelled(object? sender, EventArgs e) => Finish();

    private void Finish()
    {
        // Si ya se está cerrando (X o Alt+F4), Close no puede volver a llamarse.
        if (completed) return;
        completed = true;
        if (IsVisible) Close();
    }
}
