using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

/// <summary>
/// Diálogo de controles de teclado. Los cambios quedan en un borrador visible y solo se
/// aplican a Operación al pulsar Guardar.
/// </summary>
public sealed class KeyboardShortcutSettingsViewModel : ObservableObject
{
    private const string IdleStatus =
        "Pulse «Cambiar» y luego la tecla nueva. Los cambios se guardan solo en este equipo.";

    private readonly IKeyboardShortcutSettings settings;
    private KeyboardShortcutMap draft;
    private KeyboardShortcutItemViewModel? listening;
    private string status = IdleStatus;

    public KeyboardShortcutSettingsViewModel(IKeyboardShortcutSettings settings)
    {
        this.settings = settings;
        draft = settings.Current;
        Items = new ObservableCollection<KeyboardShortcutItemViewModel>(
            Enum.GetValues<KeyboardShortcutAction>().Select(action => new KeyboardShortcutItemViewModel(this, action)));
        SaveCommand = new RelayCommand(Save, () => HasChanges && !IsListening);
        RestoreDefaultsCommand = new RelayCommand(RestoreDefaults);
        FixedKeysText = settings.Rules.FixedKeys.Count == 0
            ? string.Empty
            : "Siempre disponibles: " + string.Join(
                "  ·  ",
                settings.Rules.FixedKeys
                    .GroupBy(pair => pair.Value)
                    .Select(group => $"{string.Join(", ", group.Select(pair => KeyboardShortcutKeyNames.Describe(pair.Key)))} " +
                                     $"para {group.Key}")) +
              ". Tab y Esc mantienen su uso habitual.";
    }

    /// <summary>Se dispara cuando los atajos se guardaron; la ventana se cierra.</summary>
    public event EventHandler? Saved;

    public ObservableCollection<KeyboardShortcutItemViewModel> Items { get; }

    public IRelayCommand SaveCommand { get; }

    public IRelayCommand RestoreDefaultsCommand { get; }

    public string FixedKeysText { get; }

    public bool HasFixedKeys => FixedKeysText.Length > 0;

    public KeyboardShortcutMap Draft => draft;

    public bool HasChanges => !draft.HasSameBindings(settings.Current);

    public bool IsListening => listening is not null;

    public string Status { get => status; private set => SetProperty(ref status, value); }

    /// <summary>
    /// Recibe la tecla pulsada mientras una acción espera su nueva tecla.
    /// Devuelve true si la tecla se consumió (no debe llegar a los botones del diálogo).
    /// </summary>
    public bool CaptureKey(string keyName, bool hasBlockingModifier, bool isRepeat = false)
    {
        KeyboardShortcutItemViewModel? item = listening;
        if (item is null) return false;
        if (isRepeat) return true;

        if (hasBlockingModifier)
        {
            // No se consume: Alt+F4 y otras combinaciones de Windows siguen funcionando.
            Status = "Use una tecla sola, sin Ctrl, Alt ni la tecla Windows.";
            return false;
        }

        if (string.Equals(keyName, "Escape", StringComparison.OrdinalIgnoreCase) &&
            item.Action != KeyboardShortcutAction.Cancel)
        {
            StopListening();
            Status = $"Esc solo puede usarse para cancelar o cerrar. «{item.Label}» conserva su tecla.";
            return true;
        }

        KeyboardShortcutValidation validation = settings.Rules.Validate(draft, item.Action, keyName);
        if (!validation.IsAllowed)
        {
            Status = $"{validation.Message} Pulse otra tecla para «{item.Label}».";
            return true;
        }

        draft = draft.With(item.Action, keyName);
        StopListening();
        RefreshAll();
        Status = $"Nueva tecla para «{item.Label}»: {KeyboardShortcutKeyNames.Describe(keyName)}. " +
                 "Pulse «Guardar» para aplicarla.";
        return true;
    }

    internal void ToggleListening(KeyboardShortcutItemViewModel item)
    {
        if (listening == item)
        {
            StopListening();
            Status = $"Cambio cancelado. «{item.Label}» conserva su tecla.";
            return;
        }

        KeyboardShortcutItemViewModel? previous = listening;
        listening = item;
        previous?.Refresh();
        item.Refresh();
        NotifyListeningChanged();
        Status = $"Pulse la nueva tecla para «{item.Label}». Pulse «Cancelar cambio» para dejarla igual.";
    }

    internal bool IsListeningFor(KeyboardShortcutItemViewModel item) => listening == item;

    internal bool IsUnsaved(KeyboardShortcutAction action) =>
        !draft.KeysFor(action).SequenceEqual(settings.Current.KeysFor(action), StringComparer.OrdinalIgnoreCase);

    private void Save()
    {
        if (!settings.Save(draft))
        {
            Status = "No se pudieron guardar los controles en este equipo. Se conservan los anteriores.";
            return;
        }

        draft = settings.Current;
        RefreshAll();
        Status = "Controles guardados. Ya se aplican en Operación.";
        Saved?.Invoke(this, EventArgs.Empty);
    }

    private void RestoreDefaults()
    {
        draft = KeyboardShortcutMap.Default;
        StopListening();
        RefreshAll();
        Status = HasChanges
            ? "Se cargaron los valores predeterminados. Pulse «Guardar» para aplicarlos."
            : "Ya se usan los valores predeterminados.";
    }

    private void StopListening()
    {
        KeyboardShortcutItemViewModel? previous = listening;
        listening = null;
        previous?.Refresh();
        NotifyListeningChanged();
    }

    private void RefreshAll()
    {
        foreach (KeyboardShortcutItemViewModel item in Items) item.Refresh();
        OnPropertyChanged(nameof(HasChanges));
        OnPropertyChanged(nameof(Draft));
        SaveCommand.NotifyCanExecuteChanged();
    }

    private void NotifyListeningChanged()
    {
        OnPropertyChanged(nameof(IsListening));
        SaveCommand.NotifyCanExecuteChanged();
    }
}

public sealed class KeyboardShortcutItemViewModel : ObservableObject
{
    private readonly KeyboardShortcutSettingsViewModel owner;

    public KeyboardShortcutItemViewModel(KeyboardShortcutSettingsViewModel owner, KeyboardShortcutAction action)
    {
        this.owner = owner;
        Action = action;
        ChangeCommand = new RelayCommand(() => owner.ToggleListening(this));
    }

    public KeyboardShortcutAction Action { get; }

    public string Label => KeyboardShortcutLabels.Label(Action);

    public string Description => KeyboardShortcutLabels.Description(Action);

    public string KeysText => IsListening
        ? "Pulse una tecla…"
        : KeyboardShortcutKeyNames.Describe(owner.Draft.KeysFor(Action));

    public bool IsListening => owner.IsListeningFor(this);

    public bool IsUnsaved => owner.IsUnsaved(Action);

    public string ChangeLabel => IsListening ? "Cancelar cambio" : "Cambiar";

    public string ChangeAutomationName => IsListening
        ? $"Cancelar el cambio de tecla de {Label}"
        : $"Cambiar la tecla de {Label}";

    public IRelayCommand ChangeCommand { get; }

    internal void Refresh()
    {
        OnPropertyChanged(nameof(KeysText));
        OnPropertyChanged(nameof(IsListening));
        OnPropertyChanged(nameof(IsUnsaved));
        OnPropertyChanged(nameof(ChangeLabel));
        OnPropertyChanged(nameof(ChangeAutomationName));
    }
}
