using System.IO;
using System.Media;
using System.Text;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Presentation.Feedback;

public sealed class WpfOperationFeedbackPlayer(IOptions<OperationSafetyOptions> options)
    : IOperationFeedbackPlayer
{
    private static readonly Lazy<SoundPlayer> SuccessPlayer = new(CreateSuccessPlayer);
    private static readonly Lazy<SoundPlayer> ReviewAlertPlayer = new(CreateReviewAlertPlayer);

    public void Play(OperationFeedbackKind kind)
    {
        if (!options.Value.SoundFeedbackEnabled)
        {
            return;
        }

        if (kind == OperationFeedbackKind.Success)
        {
            SuccessPlayer.Value.Play();
            return;
        }

        if (kind == OperationFeedbackKind.Error)
        {
            SystemSounds.Hand.Play();
        }
    }

    public void PlayReviewAlert()
    {
        if (options.Value.SoundFeedbackEnabled)
        {
            ReviewAlertPlayer.Value.Play();
        }
    }

    private static SoundPlayer CreateSuccessPlayer()
    {
        const int sampleRate = 22050;
        const double durationSeconds = 0.22;
        int sampleCount = (int)(sampleRate * durationSeconds);
        int dataLength = sampleCount * sizeof(short);
        var stream = new MemoryStream(44 + dataLength);
        using (var writer = new BinaryWriter(stream, Encoding.ASCII, leaveOpen: true))
        {
            writer.Write(Encoding.ASCII.GetBytes("RIFF"));
            writer.Write(36 + dataLength);
            writer.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
            writer.Write(16);
            writer.Write((short)1);
            writer.Write((short)1);
            writer.Write(sampleRate);
            writer.Write(sampleRate * sizeof(short));
            writer.Write((short)sizeof(short));
            writer.Write((short)16);
            writer.Write(Encoding.ASCII.GetBytes("data"));
            writer.Write(dataLength);

            double phase = 0;
            for (int sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++)
            {
                double elapsed = (double)sampleIndex / sampleRate;
                double frequency = elapsed < 0.1 ? 659.25 : 783.99;
                phase += 2 * Math.PI * frequency / sampleRate;
                double fadeIn = Math.Min(1, elapsed / 0.012);
                double fadeOut = Math.Min(1, (durationSeconds - elapsed) / 0.035);
                double envelope = Math.Max(0, Math.Min(fadeIn, fadeOut));
                writer.Write((short)(Math.Sin(phase) * short.MaxValue * 0.16 * envelope));
            }
        }

        stream.Position = 0;
        var player = new SoundPlayer(stream);
        player.Load();
        return player;
    }

    private static SoundPlayer CreateReviewAlertPlayer()
    {
        const int sampleRate = 22050;
        const double durationSeconds = 0.48;
        int sampleCount = (int)(sampleRate * durationSeconds);
        int dataLength = sampleCount * sizeof(short);
        var stream = new MemoryStream(44 + dataLength);
        using (var writer = new BinaryWriter(stream, Encoding.ASCII, leaveOpen: true))
        {
            writer.Write(Encoding.ASCII.GetBytes("RIFF"));
            writer.Write(36 + dataLength);
            writer.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
            writer.Write(16);
            writer.Write((short)1);
            writer.Write((short)1);
            writer.Write(sampleRate);
            writer.Write(sampleRate * sizeof(short));
            writer.Write((short)sizeof(short));
            writer.Write((short)16);
            writer.Write(Encoding.ASCII.GetBytes("data"));
            writer.Write(dataLength);

            double phase = 0;
            for (int sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++)
            {
                double elapsed = (double)sampleIndex / sampleRate;
                double frequency = elapsed switch
                {
                    < 0.16 => 523.25,
                    < 0.32 => 659.25,
                    _ => 783.99,
                };
                phase += 2 * Math.PI * frequency / sampleRate;
                double noteElapsed = elapsed % 0.16;
                double envelope = Math.Min(1, noteElapsed / 0.012) *
                    Math.Min(1, (0.16 - noteElapsed) / 0.035);
                writer.Write((short)(Math.Sin(phase) * short.MaxValue * 0.14 * Math.Max(0, envelope)));
            }
        }

        stream.Position = 0;
        var player = new SoundPlayer(stream);
        player.Load();
        return player;
    }
}
