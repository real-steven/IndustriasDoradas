using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Infrastructure.Audio;
using IndustriasDoradas.Desktop.Presentation.Feedback;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

/// <summary>Abre el selector nativo de archivos; la vista lo implementa.</summary>
public interface ISoundFilePicker
{
    string? PickWaveFile();
}

public sealed class SoundSettingsViewModel : ObservableObject
{
    private readonly ISoundFeedbackSettings settings;
    private readonly ISoundFilePicker filePicker;
    private bool isEnabled;
    private string status = "Los cambios se guardan solo en este equipo y no se sincronizan.";

    public SoundSettingsViewModel(ISoundFeedbackSettings settings, ISoundFilePicker filePicker)
    {
        this.settings = settings;
        this.filePicker = filePicker;
        isEnabled = settings.IsEnabled;
        Actions = new ObservableCollection<SoundActionItemViewModel>(
            Enum.GetValues<FeedbackSoundEvent>().Select(sound => new SoundActionItemViewModel(this, sound)));
        Refresh();
    }

    public ObservableCollection<SoundActionItemViewModel> Actions { get; }

    public bool IsAllowedByStation => settings.IsAllowedByStation;

    public bool ShowStationPolicy => !IsAllowedByStation;

    public string StationPolicyText => IsAllowedByStation
        ? string.Empty
        : "La configuración de la estación desactiva todos los sonidos. La respuesta visual sigue activa.";

    public bool IsEnabled
    {
        get => isEnabled;
        set
        {
            if (!SetProperty(ref isEnabled, value)) return;
            settings.SetEnabled(value);
            Status = value
                ? "Sonidos activados."
                : "Sonidos desactivados. La operación seguirá mostrando la respuesta visual.";
        }
    }

    public string Status { get => status; private set => SetProperty(ref status, value); }

    internal void Choose(SoundActionItemViewModel item)
    {
        string? path = filePicker.PickWaveFile();
        if (string.IsNullOrWhiteSpace(path)) return;
        SoundImportResult result = settings.Import(item.Sound, path);
        Status = $"{item.Label}: {result.Message}";
        item.Refresh();
    }

    internal void Preview(SoundActionItemViewModel item)
    {
        settings.Preview(item.Sound);
        Status = $"Reproduciendo: {item.Label} · {item.AssignedName}.";
    }

    internal void Restore(SoundActionItemViewModel item)
    {
        settings.Restore(item.Sound);
        item.Refresh();
        Status = $"{item.Label}: se restauró el sonido predeterminado.";
    }

    internal SoundAssignmentInfo Describe(FeedbackSoundEvent sound) => settings.Describe(sound);

    private void Refresh()
    {
        foreach (SoundActionItemViewModel item in Actions) item.Refresh();
    }
}

public sealed class SoundActionItemViewModel : ObservableObject
{
    private readonly SoundSettingsViewModel owner;
    private SoundAssignmentInfo info;

    public SoundActionItemViewModel(SoundSettingsViewModel owner, FeedbackSoundEvent sound)
    {
        this.owner = owner;
        Sound = sound;
        info = new SoundAssignmentInfo(sound, SoundAssignmentState.Default, null);
        ChooseCommand = new RelayCommand(() => owner.Choose(this));
        PreviewCommand = new RelayCommand(() => owner.Preview(this));
        RestoreCommand = new RelayCommand(() => owner.Restore(this), () => CanRestore);
    }

    public FeedbackSoundEvent Sound { get; }

    public string Label => Sound switch
    {
        FeedbackSoundEvent.CajuelaAdded => "Cajuela agregada",
        FeedbackSoundEvent.FiveCajuelasAdded => "Cinco cajuelas agregadas",
        FeedbackSoundEvent.CajuelaSubtracted => "Cajuela restada",
        FeedbackSoundEvent.SweepRegistered => "Barrida registrada",
        FeedbackSoundEvent.MercuryReviewAlert => "Revisión de mercurio",
        FeedbackSoundEvent.OperationSucceeded => "Operación exitosa",
        FeedbackSoundEvent.ErrorOrRejected => "Error o acción rechazada",
        _ => Sound.ToString(),
    };

    public string DefaultName => Sound switch
    {
        FeedbackSoundEvent.ErrorOrRejected => "Error de Windows",
        FeedbackSoundEvent.MercuryReviewAlert => "Alerta de revisión",
        _ => "Tono de éxito",
    };

    public string AssignedName => info.State switch
    {
        SoundAssignmentState.Custom => info.OriginalFileName ?? "Personalizado",
        _ => $"{DefaultName} (predeterminado)",
    };

    public string? Warning => info.State == SoundAssignmentState.FallbackToDefault
        ? $"No se pudo usar «{info.OriginalFileName}»; suena el predeterminado."
        : null;

    public bool HasWarning => Warning is not null;

    public bool CanRestore => info.State != SoundAssignmentState.Default;

    public string ChooseAutomationName => $"Elegir sonido para {Label}";
    public string PreviewAutomationName => $"Probar sonido de {Label}";
    public string RestoreAutomationName => $"Restaurar sonido predeterminado de {Label}";

    public IRelayCommand ChooseCommand { get; }
    public IRelayCommand PreviewCommand { get; }
    public IRelayCommand RestoreCommand { get; }

    internal void Refresh()
    {
        info = owner.Describe(Sound);
        OnPropertyChanged(nameof(AssignedName));
        OnPropertyChanged(nameof(Warning));
        OnPropertyChanged(nameof(HasWarning));
        OnPropertyChanged(nameof(CanRestore));
        RestoreCommand.NotifyCanExecuteChanged();
    }
}
