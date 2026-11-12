using System.Buffers.Binary;
using System.IO;

namespace IndustriasDoradas.Desktop.Infrastructure.Audio;

/// <summary>
/// Valida archivos que <see cref="System.Media.SoundPlayer"/> reproduce de forma fiable:
/// WAV RIFF con audio PCM sin comprimir. MP3, WMA, OGG o WAV comprimidos se rechazan.
/// </summary>
public static class WaveFileValidator
{
    public const string SupportedExtension = ".wav";
    public const long MaxFileBytes = 5 * 1024 * 1024;
    private const ushort PcmFormat = 1;

    public static bool HasSupportedExtension(string path) =>
        string.Equals(Path.GetExtension(path), SupportedExtension, StringComparison.OrdinalIgnoreCase);

    public static bool IsPlayablePcmWave(ReadOnlySpan<byte> bytes, out string reason)
    {
        if (bytes.Length > MaxFileBytes)
        {
            reason = "El archivo supera 5 MB.";
            return false;
        }
        if (bytes.Length < 44 || !Matches(bytes, 0, "RIFF") || !Matches(bytes, 8, "WAVE"))
        {
            reason = "El archivo no es un WAV válido.";
            return false;
        }

        bool hasPcmFormat = false;
        bool hasAudio = false;
        int offset = 12;
        while (offset + 8 <= bytes.Length)
        {
            uint chunkSize = BinaryPrimitives.ReadUInt32LittleEndian(bytes.Slice(offset + 4, 4));
            int bodyStart = offset + 8;
            if (chunkSize > (uint)(bytes.Length - bodyStart))
            {
                reason = "El archivo WAV está incompleto o dañado.";
                return false;
            }

            ReadOnlySpan<byte> body = bytes.Slice(bodyStart, (int)chunkSize);
            if (Matches(bytes, offset, "fmt "))
            {
                if (body.Length < 16)
                {
                    reason = "El encabezado de audio del WAV está dañado.";
                    return false;
                }
                ushort format = BinaryPrimitives.ReadUInt16LittleEndian(body);
                ushort channels = BinaryPrimitives.ReadUInt16LittleEndian(body[2..]);
                uint sampleRate = BinaryPrimitives.ReadUInt32LittleEndian(body[4..]);
                ushort bitsPerSample = BinaryPrimitives.ReadUInt16LittleEndian(body[14..]);
                hasPcmFormat = format == PcmFormat
                    && channels is 1 or 2
                    && sampleRate is >= 8_000 and <= 192_000
                    && bitsPerSample is 8 or 16 or 24 or 32;
                if (!hasPcmFormat)
                {
                    reason = "Solo se admite WAV PCM sin comprimir (mono o estéreo).";
                    return false;
                }
            }
            else if (Matches(bytes, offset, "data"))
            {
                hasAudio = chunkSize > 0;
            }

            // Los bloques RIFF se alinean a tamaño par.
            offset = bodyStart + (int)chunkSize + (int)(chunkSize & 1);
        }

        if (!hasPcmFormat || !hasAudio)
        {
            reason = "El archivo WAV no contiene audio PCM reproducible.";
            return false;
        }

        reason = string.Empty;
        return true;
    }

    private static bool Matches(ReadOnlySpan<byte> bytes, int offset, string tag) =>
        bytes.Length >= offset + 4
        && bytes[offset] == tag[0]
        && bytes[offset + 1] == tag[1]
        && bytes[offset + 2] == tag[2]
        && bytes[offset + 3] == tag[3];
}
