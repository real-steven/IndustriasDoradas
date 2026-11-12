using System.IO;
using System.Media;
using System.Text;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Infrastructure.Audio;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Presentation.Feedback;

/// <summary>
/// Reproduce la respuesta sonora de la operación. <see cref="SoundPlayer.Play"/> es asíncrono,
/// los archivos personalizados se leen fuera del hilo de la interfaz y cualquier fallo vuelve
/// al sonido predeterminado: reproducir nunca bloquea ni interrumpe la operación.
/// </summary>
public sealed class WpfOperationFeedbackPlayer : IOperationFeedbackPlayer, ISoundFeedbackSettings
{
    private static readonly Lazy<SoundPlayer> SuccessPlayer = new(CreateSuccessPlayer);
    private static readonly Lazy<SoundPlayer> ReviewAlertPlayer = new(CreateReviewAlertPlayer);

    private readonly IOptions<OperationSafetyOptions> options;
    private readonly SoundPreferenceStore store;
    private readonly Action<FeedbackSoundEvent>? defaultSoundOverride;
    private readonly object reloadGate = new();
    private volatile SoundSnapshot snapshot = SoundSnapshot.Empty;

    public WpfOperationFeedbackPlayer(IOptions<OperationSafetyOptions> options, SoundPreferenceStore store)
        : this(options, store, defaultSoundOverride: null, loadInBackground: true)
    {
    }

    /// <summary>Para pruebas: registra los sonidos predeterminados en lugar de emitirlos.</summary>
    public WpfOperationFeedbackPlayer(
        IOptions<OperationSafetyOptions> options,
        SoundPreferenceStore store,
        Action<FeedbackSoundEvent>? defaultSoundOverride,
        bool loadInBackground)
    {
        this.options = options;
        this.store = store;
        this.defaultSoundOverride = defaultSoundOverride;
        if (loadInBackground) _ = Task.Run(Reload);
        else Reload();
    }

    public bool IsAllowedByStation => options.Value.SoundFeedbackEnabled;

    public bool IsEnabled => snapshot.Preferences.Enabled;

    /// <summary>Último origen reproducido por acción; solo para diagnóstico y pruebas.</summary>
    public SoundAssignmentState? LastPlayedState { get; private set; }

    public void Play(OperationFeedbackKind kind)
    {
        if (kind == OperationFeedbackKind.Success) Play(kind, FeedbackSoundEvent.OperationSucceeded);
        else if (kind == OperationFeedbackKind.Error) Play(kind, FeedbackSoundEvent.ErrorOrRejected);
    }

    public void Play(OperationFeedbackKind kind, FeedbackSoundEvent sound)
    {
        if (!IsAllowedByStation || !snapshot.Preferences.Enabled) return;
        PlayAssigned(sound);
    }

    public void PlayReviewAlert() => Play(OperationFeedbackKind.Warning, FeedbackSoundEvent.MercuryReviewAlert);

    public SoundAssignmentInfo Describe(FeedbackSoundEvent sound)
    {
        SoundSnapshot current = snapshot;
        if (!current.Preferences.Assignments.TryGetValue(sound, out SoundAssignment? assignment))
        {
            return new SoundAssignmentInfo(sound, SoundAssignmentState.Default, null);
        }
        return new SoundAssignmentInfo(
            sound,
            current.CustomPlayers.ContainsKey(sound) ? SoundAssignmentState.Custom : SoundAssignmentState.FallbackToDefault,
            assignment.OriginalFileName);
    }

    public void SetEnabled(bool enabled)
    {
        store.SetEnabled(enabled);
        Reload();
    }

    public SoundImportResult Import(FeedbackSoundEvent sound, string sourcePath)
    {
        SoundImportResult result = store.Import(sound, sourcePath);
        if (!result.Succeeded) return result;
        Reload();
        return Describe(sound).State == SoundAssignmentState.Custom
            ? result
            : new SoundImportResult(false, "Windows no pudo cargar el sonido; se mantiene el predeterminado.");
    }

    public void Restore(FeedbackSoundEvent sound)
    {
        store.Restore(sound);
        Reload();
    }

    public void Preview(FeedbackSoundEvent sound) => PlayAssigned(sound);

    public void Reload()
    {
        // Serializado: la carga inicial en segundo plano nunca pisa un cambio más reciente.
        lock (reloadGate)
        {
            SoundPreferences preferences = store.Load();
            var players = new Dictionary<FeedbackSoundEvent, SoundPlayer>();
            foreach ((FeedbackSoundEvent sound, SoundAssignment assignment) in preferences.Assignments)
            {
                byte[]? bytes = store.ReadCustomSound(assignment);
                SoundPlayer? player = bytes is null ? null : TryCreatePlayer(bytes);
                if (player is not null) players[sound] = player;
            }

            // Los reproductores anteriores no se liberan: alguno puede estar sonando todavía.
            snapshot = new SoundSnapshot(preferences, players);
        }
    }

    private void PlayAssigned(FeedbackSoundEvent sound)
    {
        if (snapshot.CustomPlayers.TryGetValue(sound, out SoundPlayer? custom))
        {
            try
            {
                custom.Play();
                LastPlayedState = SoundAssignmentState.Custom;
                return;
            }
            catch (Exception exception) when (IsPlaybackFailure(exception))
            {
                // Se continúa con el sonido predeterminado.
            }
        }

        PlayDefault(sound);
        LastPlayedState = snapshot.Preferences.Assignments.ContainsKey(sound)
            ? SoundAssignmentState.FallbackToDefault
            : SoundAssignmentState.Default;
    }

    private void PlayDefault(FeedbackSoundEvent sound)
    {
        if (defaultSoundOverride is not null)
        {
            defaultSoundOverride(sound);
            return;
        }

        try
        {
            switch (sound)
            {
                case FeedbackSoundEvent.ErrorOrRejected:
                    SystemSounds.Hand.Play();
                    break;
                case FeedbackSoundEvent.MercuryReviewAlert:
                    ReviewAlertPlayer.Value.Play();
                    break;
                default:
                    SuccessPlayer.Value.Play();
                    break;
            }
        }
        catch (Exception exception) when (IsPlaybackFailure(exception))
        {
            // Sin dispositivo de audio: la respuesta visual sigue informando el resultado.
        }
    }

    private static SoundPlayer? TryCreatePlayer(byte[] bytes)
    {
        var player = new SoundPlayer(new MemoryStream(bytes, writable: false));
        try
        {
            player.Load();
            return player;
        }
        catch (Exception exception) when (IsPlaybackFailure(exception))
        {
            player.Dispose();
            return null;
        }
    }

    private static bool IsPlaybackFailure(Exception exception) =>
        exception is InvalidOperationException
            or IOException
            or TimeoutException
            or UriFormatException
            or System.ComponentModel.Win32Exception
            or ObjectDisposedException;

    private sealed record SoundSnapshot(
        SoundPreferences Preferences,
        IReadOnlyDictionary<FeedbackSoundEvent, SoundPlayer> CustomPlayers)
    {
        public static SoundSnapshot Empty { get; } =
            new(SoundPreferences.Default, new Dictionary<FeedbackSoundEvent, SoundPlayer>());
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
            WriteHeader(writer, sampleRate, dataLength);

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
            WriteHeader(writer, sampleRate, dataLength);

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

    private static void WriteHeader(BinaryWriter writer, int sampleRate, int dataLength)
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
    }
}
