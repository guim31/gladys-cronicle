# Cronicle

[Cronicle](https://github.com/jhuckaby/Cronicle) es un planificador de tareas
libre y autoalojado, con interfaz web: cada «evento» es una tarea (un script
de shell, una petición HTTP…) que se ejecuta según un horario o a demanda, en
uno o varios servidores. Esta integración lleva Cronicle a Gladys: el servidor
y cada evento seguido se convierten en dispositivos con el resultado de la
última tarea, las escenas pueden reaccionar cuando una tarea **termina bien**,
**falla** o está **bloqueada**, o cuando Cronicle **deja de responder**, una
escena puede **lanzar un evento** (y esperar a que termine), **leer** su
último resultado o **interrumpir** su tarea, y un widget del panel muestra las
últimas ejecuciones.

Probada con un Cronicle 0.9.80 real (Docker, eventos que terminan bien,
fallan y duran, lanzados por la API y por el horario); todavía no con una
instancia real de Gladys: sus comentarios son bienvenidos en
[las issues](https://github.com/guim31/gladys-cronicle/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Cronicle 0.9.x, con su servidor principal accesible desde la máquina de
  Gladys.
- Una clave de API de Cronicle. La lectura no requiere privilegios. Lanzar e
  interrumpir desde Gladys requieren los privilegios **Run events** y **Abort
  jobs** de la clave.

Lanzar un evento ejecuta código en sus servidores. Por eso no se puede lanzar
nada desde Gladys hasta que active **Permitir a Gladys lanzar e interrumpir
los eventos seguidos**, y por eso la integración nunca lee el registro de una
tarea ni el script de un evento (pueden contener secretos): solo el estado,
el código de salida, el mensaje de error y la duración.

En cada actualización (cada minuto por defecto), la integración lee la
planificación, las tareas en curso y las 100 últimas tareas terminadas; cada
5 segundos mientras una tarea de un evento seguido está en curso. Cronicle no
limita el uso de su API.

## Primeros pasos

### 1. Crear una clave de API

En Cronicle, abra **Admin → API Keys → Add API Key**. Póngale un título
(«Gladys»); deje todos los privilegios sin marcar para un uso de solo lectura,
o marque **Run events** y **Abort jobs** para lanzar e interrumpir eventos
desde Gladys.

### 2. Configurar la integración

En Gladys, **Integraciones → Cronicle → Configuración**:

- **Dirección de Cronicle**: la dirección del servidor principal, p. ej.
  `http://192.168.1.2:3012` (a una dirección IP sola se le añade el puerto
  3012). Un servidor secundario redirige al principal: introduzca el
  principal.
- **Clave de API**: la clave del paso 1.
- **Idioma de los nombres**: francés por defecto; fija los nombres de las
  funciones al añadir un dispositivo, los estados y los resultados de escena.

Guarde y pulse **Probar la conexión**: lista todos los eventos que ve la
clave, con su identificador, p. ej. `emvpg2mmu03: Copia nocturna ✓ seguido`.

### 3. Elegir los eventos

Por defecto se siguen todos los eventos (50 como máximo). Para seguir solo
algunos, escriba sus identificadores en **Eventos seguidos
(identificadores)**, separados por comas. Para lanzarlos o interrumpirlos
desde Gladys, active **Permitir a Gladys lanzar e interrumpir los eventos
seguidos**. En **Opciones**, **Una tarea está bloqueada tras** fija el umbral
del disparador de bloqueo (1 hora por defecto, o nunca).

### 4. Añadir los dispositivos

En la pestaña **Descubrir**, añada el servidor y los eventos que desee como
dispositivos. Los disparadores, las acciones y el widget funcionan para todo
evento seguido; los dispositivos aportan los estados y el historial.

## Los dispositivos

**Cronicle** (el servidor):

| Función         | Significado                                                                         |
| --------------- | ----------------------------------------------------------------------------------- |
| Accesible       | 1 mientras Cronicle responde                                                        |
| Tareas en curso | tareas en ejecución ahora, todos los eventos                                        |
| Fallos (24 h)   | tareas fallidas o interrumpidas terminadas en las últimas 24 h (100 últimas tareas) |

Un dispositivo por evento seguido, con su nombre:

| Función                     | Significado                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| Última tarea                | estado de la última tarea: Correcto, Fallido, Interrumpido, En ejecución, Nunca ejecutado |
| Última tarea correcta       | 1 cuando la última tarea terminada acabó con el código 0                                  |
| En ejecución                | 1 mientras una tarea del evento está en curso                                             |
| Último inicio               | inicio de la última tarea (día/mes horas:minutos, zona horaria de Gladys)                 |
| Duración de la última tarea | duración de la última tarea terminada, en segundos                                        |

Los dispositivos no tienen ningún mando: lanzar una tarea en servidores no es
un interruptor que un asistente de voz o una pulsación desafortunada deban
alcanzar. Un evento se lanza desde una escena o desde el widget, que pide una
confirmación.

## Panel

El widget **Últimas tareas de Cronicle** lista las últimas tareas de los
eventos seguidos (o de los elegidos en sus ajustes), las que están en curso
primero, después las terminadas, de la más reciente a la más antigua: estado,
inicio, duración. Si se permite el lanzamiento, cada evento elegido en los
ajustes (tres como máximo) tiene un botón: **Lanzar**, o **Interrumpir**
mientras una tarea está en curso. Gladys pide una confirmación antes de
enviarlo. **Actualizar** vuelve a leer Cronicle.

## Escenas

### Disparadores

- **Una tarea de Cronicle termina bien**: una tarea de un evento seguido
  termina con el código 0. Variables: nombre del evento, duración (s),
  identificador de la tarea.
- **Una tarea de Cronicle falla**: una tarea de un evento seguido termina con
  otro código o se interrumpe (a mano, tiempo agotado, servidor perdido).
  Variables: nombre del evento, mensaje de error (p. ej.
  `Script exited with code: 3: disk full`), código de salida, duración (s),
  identificador de la tarea.
- **Una tarea de Cronicle está bloqueada**: una tarea de un evento seguido
  dura más que el umbral de la configuración, una vez por tarea. Variables:
  nombre del evento, en curso desde hace (min), identificador de la tarea.
- **Cronicle deja de responder**: Cronicle respondía en la lectura anterior y
  ya no responde, una vez. Variable: el motivo.
- **Cronicle vuelve a responder**: tras un corte. Variable: duración del corte
  (min).

Los disparadores de tarea se pueden limitar a algunos eventos. Las tareas
lanzadas por el horario, a mano en Cronicle o por otra herramienta también
cuentan. La primera lectura tras la instalación no anuncia nada del pasado;
una tarea que terminó durante un reinicio de Gladys o de la integración se
anuncia una vez.

### Acciones

- **Lanzar un evento de Cronicle**: lanza un evento seguido, si se permite el
  lanzamiento. Con **Esperar al final (90 s como máximo)**, la escena espera a
  la tarea y las acciones siguientes reciben su resultado. Salidas:
  identificador de la tarea, en cola en Cronicle (el evento ya estaba en
  curso), terminada, correcta, estado, código de salida, mensaje de error,
  duración (s).
- **Leer un evento de Cronicle**: el estado de un evento seguido, para una
  condición. Salidas: estado, en ejecución, última tarea correcta, código de
  salida, mensaje de error, duración (s), último inicio, evento activado.
- **Interrumpir una tarea de Cronicle**: interrumpe la tarea en curso de un
  evento seguido, si se permite el lanzamiento. Salidas: se interrumpió una
  tarea (sí/no), identificador de la tarea.

Rechazan un evento que ya no se sigue, aunque su dispositivo siga existiendo en
Gladys.

### Ideas de escenas

- Cuando **Una tarea de Cronicle falla** para «Copia nocturna», enviar un
  mensaje de Telegram: «{{triggerEvent.data.event}} ha fallado:
  {{triggerEvent.data.message}}».
- Cuando **Una tarea de Cronicle está bloqueada**, poner la luz del pasillo en
  naranja.
- Al salir de casa, **Lanzar un evento de Cronicle** «Sincronizar fotos» con
  **Esperar al final**, y avisarle solo si «Correcta» es falso.

## Solución de problemas

- **Clave de API rechazada o desactivada**: la clave se eliminó, se desactivó
  o se copió mal; compruébela en Admin → API Keys.
- **La clave de API no tiene el privilegio**: marque **Run events** (y **Abort
  jobs**) en la clave.
- **El lanzamiento de eventos desde Gladys está desactivado**: active
  **Permitir a Gladys lanzar e interrumpir los eventos seguidos** en la
  configuración.
- **Seguidos pero no encontrados**: el identificador es incorrecto o el evento
  se eliminó. **Probar la conexión** lista lo que ve la clave.
- **No hay ninguna API de Cronicle en esta dirección**: compruebe la dirección
  y el puerto; detrás de un proxy inverso, incluya su ruta.
- **La dirección redirige**: introduzca la dirección `https://`, o la del
  servidor principal.
- Una tarea no aparece enseguida: la integración lee Cronicle cada minuto
  (configurable), cada 5 segundos mientras una tarea está en curso.

## Límites

- En cada actualización se leen las 100 últimas tareas terminadas: en un
  Cronicle muy cargado (más de 100 tareas entre dos lecturas), se pueden
  perder finales, y **Fallos (24 h)** solo cuenta dentro de esas 100 tareas.
- El registro de las tareas nunca se lee ni se muestra, por diseño; el mensaje
  de error es el que Cronicle muestra en su historial (cualquier clave de API
  se oculta).
- «Esperar al final» espera 90 s como máximo (el límite de una acción de
  escena en Gladys); una tarea más larga continúa, y los disparadores anuncian
  su final.
- Un evento limitado a una tarea a la vez queda en cola en Cronicle cuando ya
  está en curso: la acción responde entonces «en cola», sin identificador de
  tarea.
- Desarrollada y probada con Cronicle 0.9.80; las demás versiones 0.9.x
  deberían funcionar (misma API), sin probar. Sin relación con Cronicle ni con
  su autor.
