# Decisión de privacidad — fotografía de asistencia

**Estado:** aplazada para el MVP
**Fecha:** 2026-10-15
**Aplica a:** Sprint 6, check-in/out de trabajadores

## Decisión

El MVP de asistencia registra entrada y salida sin fotografía. El trabajador
selecciona su perfil en Modo Operación y confirma la marca manualmente. La marca
conserva su hora original y continúa funcionando sin Internet.

Esta decisión incluye explícitamente:

- no capturar imágenes mediante cámara USB, timbre, Raspberry u otro equipo;
- no crear archivos temporales, miniaturas, copias de recuperación ni respaldos
  fotográficos;
- no crear buckets ni rutas de Storage para asistencia;
- no almacenar blobs, referencias, checksums o metadatos de fotografías en
  SQLite o PostgreSQL;
- no generar plantillas biométricas ni ejecutar reconocimiento facial;
- no presentar una cámara ausente como incidencia del check-in/out.

## Fundamento

La fotografía se planteó como una mejora futura, pero no se ha aprobado una
finalidad que justifique recopilarla ni una política completa de consentimiento,
acceso, retención y eliminación. La asistencia manual permite validar primero
el flujo real sin recopilar un dato personal adicional y sin depender de una
cámara para registrar horas.

## Impacto funcional

La ausencia de fotografía no limita el registro de entrada o salida, el trabajo
offline, las incidencias, los ajustes auditables ni el cálculo posterior de
horas. La interfaz puede comunicar la posibilidad futura, pero no debe aparentar
que ya captura o conserva evidencia visual.

## Condiciones para reconsiderarla

Una versión posterior solo podrá incorporar fotografía después de aprobar y
documentar, como mínimo:

1. finalidad y necesidad concreta;
2. consentimiento y alternativa para quien no pueda usar cámara;
3. personas autorizadas y ventana temporal de acceso;
4. retención, respaldo, eliminación y tratamiento al terminar la relación
   laboral;
5. costo del equipo y del almacenamiento;
6. contingencia por cámara o red no disponible;
7. respuesta ante filtración, acceso indebido o pérdida;
8. separación entre fotografía de evidencia y plantilla biométrica;
9. precisión, enrolamiento y revisión humana si se propone reconocimiento
   facial.

Hasta que esas condiciones tengan aprobación explícita, el paso 6.6 se omite y
la fotografía permanece en backlog.

## Actualización — prototipo de elevación biométrica (2026-11-05)

La decisión anterior sigue vigente para **asistencia**: el check-in/out no toma
fotografías ni utiliza reconocimiento facial. Se autorizó por separado un
prototipo local y reversible únicamente para elevar temporalmente a Modo Jefe de
Planta.

El prototipo:

- requiere un PIN válido antes del primer registro facial;
- muestra la cámara durante ese registro para permitir centrar el rostro;
- en usos posteriores enciende la cámara por pocos segundos al presionar
  `Elevar acceso` y comunica el estado en pantalla;
- guarda únicamente una plantilla matemática cifrada con DPAPI para el usuario
  de Windows y la estación actuales;
- no guarda fotografías, no envía biometría a Supabase y no crea Storage;
- conserva el PIN como alternativa cuando no hay cámara o no hay coincidencia;
- no se considera todavía un control biométrico de producción, porque una cámara
  RGB común no ofrece por sí sola prueba de vida resistente a suplantación.

La implementación y sus límites se detallan en
[`prototipo-biometria-local.md`](prototipo-biometria-local.md).
