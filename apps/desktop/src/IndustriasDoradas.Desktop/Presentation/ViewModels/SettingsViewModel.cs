using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Presentation.Feedback;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class SettingsViewModel : ObservableObject
{
    private string status =
        "Los sonidos y los controles de teclado ya pueden configurarse en este equipo. Las demás opciones presentan el alcance futuro.";

    public SettingsViewModel()
        : this(null)
    {
    }

    public SettingsViewModel(ISoundFeedbackSettings? sounds)
        : this(sounds, null)
    {
    }

    public SettingsViewModel(ISoundFeedbackSettings? sounds, IKeyboardShortcutSettings? shortcuts)
    {
        Sounds = sounds;
        Shortcuts = shortcuts;
        ShowComingSoonCommand = new RelayCommand<string>(ShowComingSoon);
    }

    public string Status { get => status; private set => SetProperty(ref status, value); }
    public IRelayCommand<string> ShowComingSoonCommand { get; }

    /// <summary>Configuración local de sonidos; null en pruebas o diseño sin servicios.</summary>
    public ISoundFeedbackSettings? Sounds { get; }

    /// <summary>Atajos de teclado locales; null en pruebas o diseño sin servicios.</summary>
    public IKeyboardShortcutSettings? Shortcuts { get; }

    public bool CanConfigureSounds => Sounds is not null;

    public bool CanConfigureShortcuts => Shortcuts is not null;

    public SoundSettingsViewModel? CreateSoundSettings(ISoundFilePicker filePicker) =>
        Sounds is null ? null : new SoundSettingsViewModel(Sounds, filePicker);

    public KeyboardShortcutSettingsViewModel? CreateShortcutSettings() =>
        Shortcuts is null ? null : new KeyboardShortcutSettingsViewModel(Shortcuts);

    private void ShowComingSoon(string? feature)
    {
        string description = string.IsNullOrWhiteSpace(feature) ? "Esta configuración" : feature;
        Status = $"Próximamente: {description}. No se modificó la estación.";
    }
}
