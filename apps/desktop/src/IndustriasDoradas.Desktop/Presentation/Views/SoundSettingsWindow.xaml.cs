using System.Windows;
using IndustriasDoradas.Desktop.Infrastructure.Audio;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using Microsoft.Win32;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class SoundSettingsWindow : Window, ISoundFilePicker
{
    public SoundSettingsWindow()
    {
        InitializeComponent();
    }

    public string? PickWaveFile()
    {
        var dialog = new OpenFileDialog
        {
            Title = "Elegir sonido WAV",
            // SoundPlayer solo reproduce WAV; otros formatos se rechazan antes de copiarse.
            Filter = $"Sonido WAV (*{WaveFileValidator.SupportedExtension})|*{WaveFileValidator.SupportedExtension}",
            CheckFileExists = true,
            Multiselect = false,
        };
        return dialog.ShowDialog(this) == true ? dialog.FileName : null;
    }

    private void OnClose(object sender, RoutedEventArgs e) => Close();
}
