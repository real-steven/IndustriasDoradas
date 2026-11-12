using System.Windows;

namespace IndustriasDoradas.Desktop.Presentation;

/// <summary>
/// Ventana que controla los diálogos disponibles solo con Modo Jefe de Planta activo.
/// </summary>
public interface IPrivilegedDialogHost
{
    /// <summary>
    /// Registra el diálogo para cerrarlo cuando termine la elevación. Devuelve false si la
    /// elevación ya no está activa; en ese caso el diálogo no debe mostrarse.
    /// </summary>
    bool TryTrackPrivilegedDialog(Window dialog);
}
