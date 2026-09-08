using System.Windows.Controls;
using System.Windows.Input;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class OperationLinePanel : UserControl
{
    public OperationLinePanel()
    {
        InitializeComponent();
    }

    public bool FocusTarget(OperationFocusTarget target)
    {
        Button button = target switch
        {
            OperationFocusTarget.RegisterCajuela => RegisterButton,
            OperationFocusTarget.RevertLastCajuela => RevertButton,
            OperationFocusTarget.Confirm => ConfirmButton,
            OperationFocusTarget.Cancel => CancelButton,
            _ => throw new ArgumentOutOfRangeException(nameof(target), target, null),
        };
        return button.Focus() && Keyboard.Focus(button) is not null;
    }
}
