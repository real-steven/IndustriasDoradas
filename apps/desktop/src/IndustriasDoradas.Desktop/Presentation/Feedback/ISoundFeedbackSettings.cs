using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Infrastructure.Audio;

namespace IndustriasDoradas.Desktop.Presentation.Feedback;

public enum SoundAssignmentState
{
    Default,
    Custom,
    /// <summary>El archivo personalizado falta o está dañado; se usa el predeterminado.</summary>
    FallbackToDefault,
}

public sealed record SoundAssignmentInfo(
    FeedbackSoundEvent Sound,
    SoundAssignmentState State,
    string? OriginalFileName);

/// <summary>Configuración local de sonidos que usa el diálogo de Configuración.</summary>
public interface ISoundFeedbackSettings
{
    /// <summary>false cuando appsettings desactiva el sonido para toda la estación.</summary>
    bool IsAllowedByStation { get; }

    bool IsEnabled { get; }

    SoundAssignmentInfo Describe(FeedbackSoundEvent sound);

    void SetEnabled(bool enabled);

    SoundImportResult Import(FeedbackSoundEvent sound, string sourcePath);

    void Restore(FeedbackSoundEvent sound);

    /// <summary>Reproduce el sonido asignado aunque los sonidos estén desactivados.</summary>
    void Preview(FeedbackSoundEvent sound);
}
