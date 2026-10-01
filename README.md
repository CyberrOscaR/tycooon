# 🏙️ Tycooon

Tycoon multijugador online que se juega en el navegador. Creas una partida, compartes el código y cada jugador gestiona su propio negocio en el mismo mundo: construye, mejora, contrata, investiga y compite por tener el mayor patrimonio.

## Ejecutar en local

Requiere Node.js 18 o superior.

```bash
npm install
npm run dev          # http://localhost:3000 (servidor + cliente con recarga en caliente)
```

Para probar el multijugador, abre `http://localhost:3000` en dos navegadores (o en una ventana de incógnito). Desde otro dispositivo de la misma red, usa `http://<IP-de-tu-PC>:3000`.

Modo producción:

```bash
npm run build        # compila el cliente en dist/
npm start            # sirve web + WebSocket en el puerto $PORT (3000 por defecto)
```

`npm run check` comprueba los tipos de TypeScript.

## Despliegue (gratis o casi)

Es **un único proceso Node** sin base de datos, así que vale cualquier hosting de Node con WebSockets (Render, Railway, Fly.io, un VPS...):

- **Comando de build:** `npm install && npm run build`
- **Comando de inicio:** `npm start`
- Variables opcionales: `PORT` (la pone el hosting) y `DATA_FILE` (ruta del guardado, por defecto `data/rooms.json`).

En los planes gratuitos el disco suele borrarse al redesplegar o reiniciar: las partidas sobreviven a las recargas de página, pero no a un redespliegue (salvo que montes un disco persistente).

## Arquitectura

```
shared/game.ts    Reglas y economía (edificios, mejoras, niveles, fórmulas). Las usan servidor y cliente.
server/rooms.ts   Estado autoritativo: salas, validación de acciones, tick de producción, guardado JSON.
server/index.ts   HTTP (archivos estáticos o Vite en desarrollo) + WebSocket en /ws, en el mismo puerto.
client/           React + Vite: inicio, lobby, juego, ranking.
client/City3D.tsx Vista 3D con Three.js (edificios low-poly generados por código, sin modelos externos).
```

- **El servidor manda.** El cliente solo envía intenciones (`build`, `upgrade`, `hire`...); el servidor comprueba nivel, dinero, parcela y límites antes de aplicar nada. El dinero solo cambia en el servidor (tick de 1 s), así que tocarlo desde DevTools no sirve de nada.
- **Tiempo real:** el servidor envía el estado de la sala al ejecutarse cada acción y una vez por segundo durante la partida. El cliente interpola el contador de dinero entre ticks. No hay polling.
- **Sesiones sin cuentas:** al entrar recibes un token secreto que se guarda en `localStorage`. Al recargar, el cliente reconecta y recupera tu jugador. El token nunca se envía al resto de jugadores.
- **Persistencia:** snapshot JSON cada 10 s y al apagar el servidor. Las salas abandonadas más de 1 h se borran.
- **Protecciones básicas:** mensajes de 2 KB como máximo, límite de 20 mensajes/s por conexión, nombres saneados, como mucho 8 jugadores por sala y 300 salas.

## Cómo se juega

- Empiezas con **$250** y **3 parcelas**. Los edificios generan ingresos cada segundo, pero tienen mantenimiento.
- **Edificios** (10, se desbloquean al subir de nivel): 🍋 Limonada → ☕ Cafetería → 🍕 Pizzería → 🛒 Supermercado → 🏨 Hotel → 🏭 Fábrica → 🏦 Banco → 🎡 Parque de atracciones → 🚀 Empresa tecnológica → 🛰️ Estación espacial. Los avanzados rinden mucho más por parcela, pero tardan más en amortizarse.
- **Mejorar** un edificio (hasta nivel 5) multiplica sus ingresos y añade puestos de trabajo.
- **Empleados:** +25 % de ingresos del edificio cada uno, a cambio de un salario. Puedes despedirlos para ahorrar gastos.
- **Parcelas:** compra nuevas (hasta 12), cada una más cara que la anterior.
- **Investigaciones (10):** bonificaciones permanentes: menos mantenimiento, más ingresos, mejores empleados, salarios más bajos, mejoras y parcelas más baratas, intereses por el dinero en caja e inteligencia artificial (+50 %).
- **Nivel de jugador:** la XP sale de lo que ingresas y de lo que inviertes. Cada nivel desbloquea contenido y da +3 % de ingresos.
- **Vender** un edificio te devuelve el 60 % de lo invertido.
- **Cooperar:** desde la ciudad de otro jugador puedes enviarle dinero (hasta el 50 % del tuyo).
- **Misiones:** una cadena de 24 objetivos con recompensa en dinero, que además sirve de tutorial.
- **Monumentos (6):** ⛲ Fuente, 🌷 Jardín botánico, 🗿 Estatua, 🏟️ Estadio, 🗼 Torre y 🏰 Palacio. Dan bonificaciones permanentes y aparecen en la ciudad 3D.
- **Sacos de dinero 💰:** aparecen cada poco sobre tus edificios. Tócalos antes de 12 s para cobrar 10 s de ingresos de golpe.
- **Mejora rápida ⬆️:** cada edificio muestra un botón para mejorarlo directamente cuando te lo puedes permitir.
- **Eventos aleatorios** (cada 1-2 min, iguales para toda la sala): ☀️ Ola de calor, ✈️ Boom turístico, 🎉 Festival gastronómico, 🐂 Bolsa al alza, 🪧 Huelga, 🔌 Apagón, 📈 Inflación y 👼 Inversor ángel (ayuda al que va último). Los edificios afectados se marcan en el mapa con 🔥 o ⚠️.
- **Chat y reacciones** en el registro de actividad, también en el lobby.
- **Sonidos** sintetizados con WebAudio (sin archivos), con botón de silencio 🔊.
- **Ciudad en 3D:** gira la cámara arrastrando y haz zoom con la rueda o pellizcando. Toca una parcela para construir o mejorar. El botón *Vista 2D* cambia a la cuadrícula clásica (también se usa sola si el dispositivo no soporta WebGL). Three.js solo se descarga al entrar en una partida.
- **Modo cooperativo 🤝** (pensado para 2 personas): cada uno lleva su propia ciudad, así que nadie estorba al otro. El equipo aporta dinero a 4 grandes proyectos (🌉 Puente, 🚄 Tren, 🛫 Aeropuerto, 🚀 Puerto espacial). Cada proyecto terminado da ingresos extra a todos, y terminar el último gana la partida, siempre que sea antes de que la corporación rival 🦹 MegaCorp llegue al 100 %. Dificultades: 🌱 Fácil (rival en 80 min, proyectos a mitad de precio, +20 % de ingresos), ⚖️ Normal (55 min) y 🔥 Difícil (40 min, proyectos al doble de precio). Los costes se ajustan al número de jugadores.
- **Victoria en modo competitivo (sin límite de tiempo):** gana el primero en completar el **100 % de su imperio**: todas las parcelas, todas las investigaciones, todos los monumentos y cada tipo de edificio llevado alguna vez a nivel 5 (la colección de la pestaña *Imperio*). El ranking se ordena por ese porcentaje.

## Fase 2

Hecho: eventos aleatorios, misiones, chat con reacciones, sonidos y ciudad en 3D.
Pendiente: comercio entre jugadores, más recursos y edificios, personalización.
