using System.Windows.Controls;
using System.Windows.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Presentation.Input;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class OperationView : UserControl
{
    private WpfKeyboardInputAdapter? keyboardAdapter;

    public OperationView()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
        PreviewKeyDown += OnPreviewKeyDown;
    }

    private OperationViewModel? ViewModel => DataContext as OperationViewModel;

    private async void OnLoaded(object sender, System.Windows.RoutedEventArgs e)
    {
        if (ViewModel is null)
        {
            return;
        }

        await ViewModel.RefreshAsync();
        keyboardAdapter = new WpfKeyboardInputAdapter(ViewModel.InputSource);
        keyboardAdapter.Connect();
        FocusCurrentTarget();
    }

    private void OnUnloaded(object sender, System.Windows.RoutedEventArgs e)
    {
        keyboardAdapter?.Disconnect();
        keyboardAdapter = null;
    }

    private async void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (ViewModel is null ||
            keyboardAdapter is null ||
            !keyboardAdapter.TryTranslate(e.Key, e.IsRepeat, out OperationInputCommand? command) ||
            command is null)
        {
            return;
        }

        e.Handled = true;
        await ViewModel.HandleInputCommandAsync(command);
        FocusCurrentTarget();
    }

    private void FocusCurrentTarget()
    {
        if (ViewModel is not null && LinePanel.FocusTarget(ViewModel.FocusedTarget))
        {
            return;
        }

        Focus();
        Keyboard.Focus(this);
    }
}
