# Prototipo local de elevación biométrica

**Estado:** experimental, no habilita asistencia biométrica
**Fecha:** 2026-11-05
**Alcance:** aplicación desktop, acción `Elevar acceso`

## Flujo aprobado

1. El jefe de planta abre `Elevar acceso` e ingresa su PIN para autorizar el
   primer registro.
2. Se abre una ventana con vista previa y guía tres posiciones estables: frente,
   giro ligero hacia un lado y giro ligero al lado contrario. Cada posición debe
   mantenerse antes de ser aceptada para evitar registros instantáneos o de lado.
3. Las imágenes viven solo en memoria. Al terminar, la cámara se libera y se
   conserva únicamente el promedio de las características faciales.
4. En accesos posteriores, presionar `Elevar acceso` inicia una comprobación
   silenciosa de hasta seis segundos. La interfaz muestra mensajes discretos
   como `Buscando rostro…` y `Verificando identidad…`.
5. Una coincidencia activa el modo privilegiado respetando la autorización local
   vigente y el cierre por inactividad. Un fallo deja disponible el PIN.

## Protección y almacenamiento

- La plantilla está ligada al identificador del perfil que abrió la estación.
- Se guarda un archivo cifrado por perfil dentro de `biometric-profiles`, en la
  carpeta local específica de la estación. Esto permite registrar más de un
  jefe de planta sin mezclar sus plantillas.
- El contenido se cifra con DPAPI (`CurrentUser`) y entropía propia de la
  aplicación; copiar el archivo a otro usuario o equipo no lo vuelve utilizable.
- No se guardan fotogramas, miniaturas ni fotografías.
- No se sincroniza la plantilla con Supabase ni se incluye en respaldos de datos
  operativos.
- Los eventos de elevación aceptada o rechazada continúan quedando en auditoría.

## Modelos locales

El prototipo utiliza OpenCV con YuNet para detección y SFace para comparación.
Los modelos se descargan del repositorio oficial de OpenCV Zoo la primera vez,
quedan en la carpeta local de la estación y se validan con SHA-256 antes de
cargarse. Después de esa preparación inicial pueden utilizarse sin Internet.

## Límites antes de producción

- Una cámara RGB como la Nuroum V11 no incorpora profundidad o infrarrojo
  equivalente a Face ID.
- El prototipo no debe considerarse resistente a fotografías o pantallas hasta
  implementar y probar prueba de vida.
- Antes de aplicarlo a asistencia deben definirse consentimiento, alternativa no
  biométrica, altas y bajas de plantillas, retención y revisión de falsos
  positivos/negativos.
- Deben realizarse pruebas reales de iluminación, distancia, uso de lentes y
  cambios de apariencia en la planta.

## Reversibilidad

El PIN continúa siendo el mecanismo de respaldo. La eliminación del archivo del
perfil dentro de `biometric-profiles` desactiva su registro local sin alterar la
sesión, los usuarios, la asistencia ni la base operativa.
