/* =====================================================================
 *  HydraPet — Prototipo físico del llavero gota (ESP32)
 *  ---------------------------------------------------------------------
 *  Archivo : hydrapet_esp32.ino
 *  Target  : ESP32 DevKit v1 (ESP32-WROOM-32)  ·  Core esp32:esp32 3.x
 *  Autor   : Proyecto HydraPet
 *
 *  FUNCIONAMIENTO (sin WiFi, sin Bluetooth, sin app, sin pantalla):
 *    1) LED AZUL  -> llega el momento de tomar agua (recordatorio activo)
 *    2) LED VERDE -> el usuario presionó el botón: toma confirmada
 *       (parpadea 2 veces para que se note claramente)
 *    3) LED ROJO  -> pasaron ~5 min sin pressionar: queda en rojo hasta
 *                    que el usuario confirme
 *    4) Al confirmar, el LED se apaga y el prototipo queda preparado
 *       para el siguiente recordatorio
 *    5) Los intervalos se modifican en el bloque de configuración de
 *       abajo, o en caliente manteniendo el botón al encender
 *    6) Todo usa millis(); nunca delay() -> el botón nunca se bloquea
 *
 *  NOTAS DE HARDWARE QUE DEBES REVISAR (ver firmware/CONEXIONES.md):
 *    - Tipo de LED: el sketch asume LED RGB de ANODO COMUN (4 pines).
 *      Si tu LED es de CATODO COMUN, cambia LED_ANODO_COMUN a 0.
 *    - Corriente: usa un LED RGB de 10 mA con resistencias de 330 ohm.
 *      Si tu LED es de 20 mA, ver la nota de MOSFET en CONEXIONES.md.
 *    - Bateria: 3.7 V LiPo -> cargador TP4056 -> convertidor boost 5 V
 *      -> pin 5V/VIN del ESP32. (Alimenta la placa, NO el pin 3V3.)
 *
 * =====================================================================
 *  DIAGRAMA DE CONEXIONES (texto)
 *  ---------------------------------------------------------------------
 *
 *          ESP32 DevKit v1                  LED RGB (ánodo común)
 *        ┌───────────────┐                ┌─────────────────────┐
 *  GND ──┤ GND        3V3 ├────────────────┤ ÁNODO   (pin largo)  │
 *        │               │                │                     │
 * GPIO25 ┤ 25   R  330Ω ├─┐              │                     │
 *        │               │ └──────────────┤ Cátodo ROJO         │
 * GPIO26 ┤ 26   G  330Ω ├─┐              │                     │
 *        │               │ └──────────────┤ Cátodo VERDE        │
 *        │               │                │                     │
 * GPIO27 ┤ 27   B  330Ω ├─┐              │                     │
 *        │               │ └──────────────┤ Cátodo AZUL         │
 *        │               │                └─────────────────────┘
 *        │               │
 * GPIO32 ┤ 32        GND ├─┐
 *        │               │ └──────┐   BOTÓN (pulsador)
 *        │               │        └────────────────┐
 *        │               │                         │
 *  5V/VIN ┤ 5V           │                      (a GND)
 *        └───────────────┘
 *
 *  ALIMENTACIÓN (opción A, recomendada):
 *      LiPo 3.7 V ──> TP4056 (carga) ──> convertidor boost 5 V ──> 5V/VIN
 *
 *  ALIMENTACIÓN (opción B, la más simple):
 *      Power bank 5 V ──> 5V/VIN        o simplemente el cable USB
 *
 *  - Cada resistencia de 330 Ω va EN SERIE con un cátodo del LED.
 *  - El botón va entre GPIO32 y GND (el ESP32 usa su pull-up interno).
 *  - No alimentes el LED desde 3V3: el consumo por pin excedería lo que
 *    puede dar la fuente del ESP32. Usa 5V/VIN o un MOSFET (ver guía).
 *  - Si tu LED es de CÁTODO COMÚN: cátodo a GND, resistencias en los
 *    ánodos y cambia LED_ANODO_COMUN a 0 en el código.
 *
 * =====================================================================
 *  CÓMO CARGAR EL PROGRAMA
 *  ---------------------------------------------------------------------
 *  1) Instala el core: Gestor de tarjetas -> buscar "esp32" (by Espressif)
 *  2) Placa: Herramientas -> Placa -> "ESP32 Dev Module"
 *  3) Conecta el USB y elige el puerto Serie correcto (COMx en Windows)
 *  4) Herramientas -> Upload Speed: 115200
 *  5) Pulsa "Subir" (Ctrl+U)
 *  6) Abre el Monitor Serie a 115200 baudios para ver los mensajes
 * ===================================================================== */

#include <Arduino.h>
#include <EEPROM.h>

/* =====================================================================
 *  1. ASIGNACIÓN DE PINES
 *  ---------------------------------------------------------------------
 *  GPIO usados (todos seguros, ninguno de boot ni strapping):
 *    25 -> canal ROJO   del LED RGB
 *    26 -> canal VERDE  del LED RGB
 *    27 -> canal AZUL   del LED RGB
 *    32 -> BOTÓN (solo entrada; ideal porque no tiene salida)
 *
 *  EVITA usar GPIO 0, 2, 12 y 15 (arranque) y 34-39 si tu placa usa
 *  PSRAM (WROVER) — en ese caso mueve el botón a GPIO 4 o 13.
 * ===================================================================== */
#define PIN_LED_R        25
#define PIN_LED_G        26
#define PIN_LED_B        27
#define PIN_BOTON        32

/* =====================================================================
 *  2. TIPO DE LED RGB  (¡CAMBIA AQUÍ SI ES NECESARIO!)
 *  ---------------------------------------------------------------------
 *  LED_ANODO_COMUN = 1  ->  LED de ÁNODO COMÚN (el más común en 5 mm)
 *                          Ánodo a 3.3 V, cátodos con resistencia a GPIO.
 *                          En esta configuración: GPIO HIGH = canal APAGADO.
 *  LED_ANODO_COMUN = 0  ->  LED de CÁTODO COMÚN
 *                          Cátodo a GND, ánodos con resistencia a GPIO.
 *                          En esta configuración: GPIO HIGH = canal ENCENDIDO.
 * ===================================================================== */
#define LED_ANODO_COMUN  1

/* =====================================================================
 *  3. INTERVALOS Y TIEMPOS  (TODO MODIFICABLE AQUÍ)
 *  ---------------------------------------------------------------------
 *  Usa sufijos UL para forzar aritmética de 32 bits sin overflow.
 * ===================================================================== */
#define INTERVALO_RECORDATORIO_MS   (2UL * 60UL * 60UL * 1000UL) // 2 h entre tomas
#define TIEMPO_GRACIA_MS            (5UL * 60UL * 1000UL)         // 5 min -> rojo
#define DURACION_VERDE_MS           (2UL * 1000UL)                // (reservado)
#define DURACION_PARPadeo_VERDE_MS  (350UL)                       // cada fase on/off
#define NUMERO_PARPADEOS_VERDE      2                             // parpadeos al confirmar
#define TIEMPO_DEBOUNCE_MS          (40UL)                        // rebote del botón
#define VENTANA_AJUSTE_INICIO_MS    (4UL * 1000UL)                // arranque: ajuste
#define TIMEOUT_AJUSTE_MS           (6UL * 1000UL)                // fin de ajuste

/* =====================================================================
 *  4. PWM / BRILLO
 * ===================================================================== */
#define PWM_FRECUENCIA   5000      // Hz
#define PWM_RESOLUCION   8         // 0-255
#define BRILLO_MAXIMO    60        // duty 0-255 (60 -> ~23%, suave y seguro)
#define BRILLO_MINIMO    15        // mínimo durante la "respiración" azul
#define CICLO_RESPIRACION_MS 3000  // duración de un ciclo azul

/* =====================================================================
 *  5. COMPATIBILIDAD ENTRE CORES DE ARDUINO PARA ESP32
 *  ---------------------------------------------------------------------
 *  esp32:esp32 3.x  -> ledcAttach(pin, freq, res) / ledcWrite(pin, duty)
 *  arduino:esp32 2.x -> ledcSetup(ch, freq, res) / ledcWrite(ch, duty)
 * ===================================================================== */
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  #define LEDC_SETUP(pin, ch)  ledcAttach(pin, PWM_FRECUENCIA, PWM_RESOLUCION)
  #define LEDC_OUT(pin, ch, duty) ledcWrite(pin, duty)
#else
  #define LEDC_SETUP(pin, ch)  do { ledcSetup(ch, PWM_FRECUENCIA, PWM_RESOLUCION); \
                                    ledcAttachPin(pin, ch); } while (0)
  #define LEDC_OUT(pin, ch, duty) ledcWrite(ch, duty)
#endif

/* =====================================================================
 *  6. ESTADOS DE LA MÁQUINA
 * ===================================================================== */
enum Estado {
  ESTADO_ESPERANDO = 0,  // LED apagado, contando hacia el próximo aviso
  ESTADO_AZUL,           // recordatorio: azul respirando
  ESTADO_ROJO,           // se pasó el tiempo de gracia: rojo hasta confirmar
  ESTADO_VERDE           // confirmación: verde por un momento
};

enum ModoArranque {
  MODO_NORMAL = 0,
  MODO_AJUSTE            // el usuario está configurando el intervalo
};

/* =====================================================================
 *  7. INTERVALOS DISPONIBLES PARA EL AJUSTE EN CALIENTE
 * ===================================================================== */
const unsigned long INTERVALOS[] = {
  30UL * 60UL * 1000UL,          // 30 minutos
  60UL * 60UL * 1000UL,          // 1 hora
  2UL * 60UL * 60UL * 1000UL,    // 2 horas
  3UL * 60UL * 60UL * 1000UL,    // 3 horas
  4UL * 60UL * 60UL * 1000UL     // 4 horas
};
const char* NOMBRES_INTERVALO[] = { "30 min", "1 hora", "2 horas", "3 horas", "4 horas" };
const uint8_t TOTAL_INTERVALOS = sizeof(INTERVALOS) / sizeof(INTERVALOS[0]);

#define EEPROM_ADDR_INTERVALO 0   // índice del intervalo guardado

/* =====================================================================
 *  8. VARIABLES GLOBALES
 * ===================================================================== */
Estado  estado            = ESTADO_ESPERANDO;
ModoArranque modo         = MODO_NORMAL;
uint8_t indiceIntervalo   = 2;                 // 2 horas por defecto
unsigned long intervaloMs  = INTERVALOS[2];

unsigned long ultimoEvento     = 0;   // último recordatorio/confirmación
unsigned long inicioAviso      = 0;   // cuándo empezó el azul
unsigned long inicioVerde      = 0;   // cuándo empezó el verde
unsigned long inicioArranque   = 0;

// Botón con antirrebote
bool     botonEstadoBruto = false;   // lectura actual
bool     botonEstadoEstable = false;// lectura filtrada
bool     botonPrevioEstable = false;// para detectar flancos
unsigned long ultimoCambioBoton = 0;

/* =====================================================================
 *  9. UTILIDADES
 * ===================================================================== */

/* Escribe un color. r/g/b de 0 a 255. */
void colorLed(uint8_t r, uint8_t g, uint8_t b) {
  #if LED_ANODO_COMUN
    // Ánodo común: el cátodo en LOW enciende -> invierte el duty
    LEDC_OUT(PIN_LED_R, 0, (uint8_t)(255 - r));
    LEDC_OUT(PIN_LED_G, 1, (uint8_t)(255 - g));
    LEDC_OUT(PIN_LED_B, 2, (uint8_t)(255 - b));
  #else
    // Cátodo común: el ánodo en HIGH enciende
    LEDC_OUT(PIN_LED_R, 0, r);
    LEDC_OUT(PIN_LED_G, 1, g);
    LEDC_OUT(PIN_LED_B, 2, b);
  #endif
}

void apagarLed() { colorLed(0, 0, 0); }

void ledAzul(uint8_t brillo)  { colorLed(0, 0, brillo); }
void ledVerde(uint8_t brillo) { colorLed(0, brillo, 0); }
void ledRojo(uint8_t brillo)  { colorLed(brillo, 0, 0); }

/* Triángulo 0..1 para el efecto de "respiración" (sin floats ni delay) */
float ondaTriangular(unsigned long transcurrido) {
  unsigned long fase = transcurrido % CICLO_RESPIRACION_MS;
  if (fase < CICLO_RESPIRACION_MS / 2) {
    return (float)fase / (float)(CICLO_RESPIRACION_MS / 2);
  }
  return 1.0f - ((float)(fase - CICLO_RESPIRACION_MS / 2) / (float)(CICLO_RESPIRACION_MS / 2));
}

/* Anti-rebote del botón. Devuelve true solo en el flanco de PRESIÓN. */
bool pulsacionDetectada() {
  unsigned long ahora = millis();
  bool crudo = (digitalRead(PIN_BOTON) == LOW);   // INPUT_PULLUP -> LOW = presionado

  if (crudo != botonEstadoBruto) {
    botonEstadoBruto = crudo;
    ultimoCambioBoton = ahora;
  }
  if ((ahora - ultimoCambioBoton) > TIEMPO_DEBOUNCE_MS && botonEstadoBruto != botonEstadoEstable) {
    botonEstadoEstable = botonEstadoBruto;
    if (botonEstadoEstable && !botonPrevioEstable) {
      botonPrevioEstable = true;
      return true;                                  // flanco de bajada = pulsación
    }
    if (!botonEstadoEstable) botonPrevioEstable = false;
  }
  return false;
}

/* Reinicia la cuenta del próximo recordatorio (tras confirmar). */
void reiniciarTemporizador(unsigned long ahora) {
  ultimoEvento = ahora;
  estado = ESTADO_ESPERANDO;
  apagarLed();
}

/* Carga el intervalo guardado en la EEPROM (si existe). */
void cargarIntervaloGuardado() {
  if (!EEPROM.begin(512)) {
    Serial.println(F("[AVISO] No se pudo iniciar EEPROM; se usa el intervalo por defecto."));
    intervaloMs = INTERVALO_RECORDATORIO_MS;
    return;
  }
  uint8_t idx = EEPROM.read(EEPROM_ADDR_INTERVALO);
  if (idx < TOTAL_INTERVALOS) {
    indiceIntervalo = idx;
  } else {
    indiceIntervalo = 2;                 // valor por defecto: 2 horas
  }
  intervaloMs = INTERVALOS[indiceIntervalo];
  EEPROM.end();
}

void guardarIntervalo() {
  if (!EEPROM.begin(512)) return;
  EEPROM.write(EEPROM_ADDR_INTERVALO, indiceIntervalo);
  EEPROM.commit();
  EEPROM.end();
}

/* =====================================================================
 *  10. MODO AJUSTE DE INTERVALO AL ENCENDER
 *  ---------------------------------------------------------------------
 *  Mantén el botón presionado durante los primeros 4 s al encender:
 *  el LED parpadea en blanco y cada pulsación avanza al siguiente
 *  intervalo (30 min -> 1 h -> 2 h -> 3 h -> 4 h). Tras 6 s sin
 *  pulsar, se guarda el valor en la EEPROM y el llavero arranca normal.
 * ===================================================================== */
void ejecutarAjusteIntervalo(unsigned long ahora) {
  static unsigned long ultimaPulsacion = 0;
  static bool parpadeo = false;
  static unsigned long ultimoParpadeo = 0;

  // Parpadeo blanco para indicar "estás en modo ajuste"
  if ((ahora - ultimoParpadeo) > 250) {
    parpadeo = !parpadeo;
    ultimoParpadeo = ahora;
  }
  if (parpadeo) colorLed(BRILLO_MAXIMO, BRILLO_MAXIMO, BRILLO_MAXIMO);
  else          apagarLed();

  if (pulsacionDetectada()) {
    indiceIntervalo = (indiceIntervalo + 1) % TOTAL_INTERVALOS;
    intervaloMs    = INTERVALOS[indiceIntervalo];
    ultimaPulsacion = ahora;
    Serial.print(F("[AJUSTE] Intervalo -> "));
    Serial.println(NOMBRES_INTERVALO[indiceIntervalo]);
  }

  // Salir del modo ajuste tras el timeout sin pulsaciones
  if ((ahora - ultimaPulsacion) > TIMEOUT_AJUSTE_MS) {
    guardarIntervalo();
    Serial.print(F("[AJUSTE] Guardado: "));
    Serial.println(NOMBRES_INTERVALO[indiceIntervalo]);
    modo = MODO_NORMAL;
    ultimoEvento = ahora;
    estado = ESTADO_ESPERANDO;
    apagarLed();
  }
}

/* =====================================================================
 *  11. SETUP
 * ===================================================================== */
void setup() {
  Serial.begin(115200);
  delay(200);   // solo al arrancar: no bloquea el funcionamiento
  Serial.println();
  Serial.println(F("=== HydraPet · Llavero gota (ESP32) ==="));

  // Pines del LED
  LEDC_SETUP(PIN_LED_R, 0);
  LEDC_SETUP(PIN_LED_G, 1);
  LEDC_SETUP(PIN_LED_B, 2);
  pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_LED_G, OUTPUT);
  pinMode(PIN_LED_B, OUTPUT);
  apagarLed();

  // Botón con pull-up interno (no hace falta resistencia externa,
  // pero 10 kΩ a GND mejora la immunity al ruido dentro de la gota)
  pinMode(PIN_BOTON, INPUT_PULLUP);

  // Cargar intervalo guardado
  cargarIntervaloGuardado();
  Serial.print(F("[INFO] Intervalo actual: "));
  Serial.println(NOMBRES_INTERVALO[indiceIntervalo]);

  // ¿El usuario quiere ajustar el intervalo? (botón presionado al inicio)
  inicioArranque = millis();
  if (digitalRead(PIN_BOTON) == LOW) {
    modo = MODO_AJUSTE;
    Serial.println(F("[INFO] Modo ajuste: pulsa para cambiar el intervalo."));
  }
}

/* =====================================================================
 *  12. LOOP — 100% no bloqueante
 * ===================================================================== */
void loop() {
  unsigned long ahora = millis();

  // --- Modo ajuste de intervalo (solo al encender) ---
  if (modo == MODO_AJUSTE) {
    ejecutarAjusteIntervalo(ahora);
    return;
  }

  // --- Botón: confirmar la toma ---
  if (pulsacionDetectada()) {
    if (estado == ESTADO_AZUL || estado == ESTADO_ROJO) {
      estado = ESTADO_VERDE;
      inicioVerde = ahora;
      Serial.println(F("[ACCION] Toma confirmada por el usuario."));
    }
  }

  // --- Máquina de estados ---
  switch (estado) {

    case ESTADO_ESPERANDO:
      apagarLed();
      if ((unsigned long)(ahora - ultimoEvento) >= intervaloMs) {
        estado = ESTADO_AZUL;
        inicioAviso = ahora;
        Serial.print(F("[AVISO] Hora de tomar agua. Ventana: "));
        Serial.print(TIEMPO_GRACIA_MS / 1000);
        Serial.println(F(" s"));
      }
      break;

    case ESTADO_AZUL:
      // "Respira" mientras espera la confirmación
      {
        float w = ondaTriangular(ahora - inicioAviso);
        uint8_t brillo = (uint8_t)(BRILLO_MINIMO +
                          w * (float)(BRILLO_MAXIMO - BRILLO_MINIMO));
        ledAzul(brillo);
      }
      // Si se agota el tiempo de gracia -> rojo
      if ((unsigned long)(ahora - inicioAviso) >= TIEMPO_GRACIA_MS) {
        estado = ESTADO_ROJO;
        Serial.println(F("[ALERTA] Sin respuesta: LED en ROJO hasta confirmar."));
      }
      break;

    case ESTADO_ROJO:
      ledRojo(BRILLO_MAXIMO);   // rojo fijo hasta que el usuario confirme
      break;

    case ESTADO_VERDE: {
      // Doble parpadeo en verde para que la confirmación se note bien
      unsigned long transcurrido = (unsigned long)(ahora - inicioVerde);
      unsigned long fase     = transcurrido / DURACION_PARPadeo_VERDE_MS;
      unsigned long fasesTotales = (unsigned long)NUMERO_PARPADEOS_VERDE * 2UL;

      if (fase >= fasesTotales) {
        Serial.println(F("[INFO] Listo para el siguiente recordatorio."));
        reiniciarTemporizador(ahora);
      } else if ((fase % 2UL) == 0UL) {
        ledVerde(BRILLO_MAXIMO);   // verde encendido
      } else {
        apagarLed();               // verde apagado (pausa entre parpadeos)
      }
      break;
    }
  }
}

/* =====================================================================
 *  FIN DEL SKETCH
 * ===================================================================== */
