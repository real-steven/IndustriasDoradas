using System.Runtime.InteropServices;

namespace IndustriasDoradas.Desktop.Presentation;

/// <summary>Escribe texto en el portapapeles; devuelve false si Windows lo rechaza.</summary>
public interface IClipboardWriter
{
    bool TrySetText(string text);
}

public sealed class WpfClipboardWriter : IClipboardWriter
{
    public bool TrySetText(string text)
    {
        try
        {
            System.Windows.Clipboard.SetText(text);
            return true;
        }
        catch (Exception exception) when (exception is ExternalException or InvalidOperationException)
        {
            // Otro programa puede tener abierto el portapapeles.
            return false;
        }
    }
}
