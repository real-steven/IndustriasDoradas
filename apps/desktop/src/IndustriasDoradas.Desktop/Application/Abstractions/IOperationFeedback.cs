namespace IndustriasDoradas.Desktop.Application.Abstractions;

public enum OperationFeedbackKind
{
    Neutral,
    Success,
    Warning,
    Error,
}

/// <summary>Acciones de la operación que pueden tener un sonido de respuesta configurable.</summary>
public enum FeedbackSoundEvent
{
    CajuelaAdded,
    FiveCajuelasAdded,
    CajuelaSubtracted,
    SweepRegistered,
    MercuryReviewAlert,
    OperationSucceeded,
    ErrorOrRejected,
}

public interface IOperationFeedbackPlayer
{
    void Play(OperationFeedbackKind kind);

    /// <summary>
    /// Reproduce el sonido de una acción concreta. Nunca bloquea ni lanza excepciones.
    /// Por defecto equivale al sonido genérico del tipo de respuesta.
    /// </summary>
    void Play(OperationFeedbackKind kind, FeedbackSoundEvent sound) => Play(kind);

    void PlayReviewAlert();
}
