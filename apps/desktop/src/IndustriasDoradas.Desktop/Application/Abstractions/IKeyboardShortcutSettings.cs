using IndustriasDoradas.Desktop.Application;

namespace IndustriasDoradas.Desktop.Application.Abstractions;

/// <summary>Atajos de teclado locales de esta estación y este usuario de Windows.</summary>
public interface IKeyboardShortcutSettings
{
    /// <summary>Atajos vigentes; siempre es un mapa válido (los predeterminados si no hay otro).</summary>
    KeyboardShortcutMap Current { get; }

    KeyboardShortcutRules Rules { get; }

    /// <summary>Guarda los atajos. Devuelve false si el mapa es inválido o no se pudo escribir.</summary>
    bool Save(KeyboardShortcutMap map);
}
