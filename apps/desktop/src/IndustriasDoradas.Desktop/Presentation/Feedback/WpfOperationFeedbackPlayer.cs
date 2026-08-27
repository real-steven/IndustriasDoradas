using System.Media;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Presentation.Feedback;

public sealed class WpfOperationFeedbackPlayer(IOptions<OperationSafetyOptions> options)
    : IOperationFeedbackPlayer
{
    public void Play(OperationFeedbackKind kind)
    {
        if (!options.Value.SoundFeedbackEnabled)
        {
            return;
        }

        SystemSound? sound = kind switch
        {
            OperationFeedbackKind.Success => SystemSounds.Asterisk,
            OperationFeedbackKind.Warning => SystemSounds.Exclamation,
            OperationFeedbackKind.Error => SystemSounds.Hand,
            _ => null,
        };
        sound?.Play();
    }
}
