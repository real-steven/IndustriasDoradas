using Microsoft.Win32;

namespace IndustriasDoradas.Desktop.Presentation;

/// <summary>Selector de archivos de Windows para la foto de perfil (JPEG o PNG).</summary>
public static class ProfilePhotoPicker
{
    public static string? Pick()
    {
        var dialog = new OpenFileDialog
        {
            Title = "Elegir fotografía de perfil",
            Filter = "Imágenes JPEG o PNG (*.jpg;*.jpeg;*.png)|*.jpg;*.jpeg;*.png",
            CheckFileExists = true,
            Multiselect = false,
        };
        System.Windows.Window? owner = System.Windows.Application.Current?.MainWindow;
        bool? accepted = owner is null ? dialog.ShowDialog() : dialog.ShowDialog(owner);
        return accepted == true ? dialog.FileName : null;
    }
}
