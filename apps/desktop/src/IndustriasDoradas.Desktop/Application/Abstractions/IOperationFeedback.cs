namespace IndustriasDoradas.Desktop.Application.Abstractions;

public enum OperationFeedbackKind
{
    Neutral,
    Success,
    Warning,
    Error,
}

public interface IOperationFeedbackPlayer
{
    void Play(OperationFeedbackKind kind);
}
