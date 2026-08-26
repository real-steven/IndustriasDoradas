using System.Windows.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Presentation.Input;

public sealed class WpfKeyboardInputAdapter(IInputCommandSource source)
{
    public bool IsConnected { get; private set; }

    public void Connect() => IsConnected = true;

    public void Disconnect() => IsConnected = false;

    public bool TryTranslate(
        Key key,
        bool isRepeat,
        out OperationInputCommand? command)
    {
        command = null;
        return IsConnected &&
               source.TryCreateForAdapter("KEYBOARD", key.ToString(), isRepeat, out command);
    }
}
