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
```

- **El servidor manda.** El cliente solo envía intenciones (`build`, `upgrade`, `hire`...); el servidor comprueba nivel, dinero, parcela y límites antes de aplicar nada. El dinero solo cambia en el servidor (tick de 1 s), así que tocarlo desde DevTools no sirve de nada.
- **Tiempo real:** el servidor envía el estado de la sala al ejecutarse cada acción y una vez por segundo durante la partida. El cliente interpola el contador de dinero entre ticks. No hay polling.
- **Sesiones sin cuentas:** al entrar recibes un token secreto que se guarda en `localStorage`. Al recargar, el cliente reconecta y recupera tu jugador. El token nunca se envía al resto de jugadores.
- **Persistencia:** snapshot JSON cada 10 s y al apagar el servidor. Las salas abandonadas más de 1 h se borran.
- **Protecciones básicas:** mensajes de 2 KB como máximo, límite de 20 mensajes/s por conexión, nombres saneados, como mucho 8 jugadores por sala y 300 salas.

## Cómo se juega

- Empiezas con **$250** y **3 parcelas**. Los edificios generan ingresos cada segundo, pero tienen mantenimiento.
- **Edificios** (se desbloquean al subir de nivel): 🍋 Limonada → ☕ Cafetería → 🍕 Pizzería → 🛒 Supermercado → 🏭 Fábrica → 🏦 Banco → 🚀 Empresa tecnológica. Los avanzados rinden mucho más por parcela, pero tardan más en amortizarse.
- **Mejorar** un edificio (hasta nivel 5) multiplica sus ingresos y añade puestos de trabajo.
- **Empleados:** +25 % de ingresos del edificio cada uno, a cambio de un salario. Puedes despedirlos para ahorrar gastos.
- **Parcelas:** compra nuevas (hasta 12), cada una más cara que la anterior.
- **Investigaciones:** bonificaciones permanentes (menos mantenimiento, más ingresos, mejores empleados, parcelas más baratas).
- **Nivel de jugador:** la XP sale de lo que ingresas y de lo que inviertes. Cada nivel desbloquea contenido y da +3 % de ingresos.
- **Vender** un edificio te devuelve el 60 % de lo invertido.
- **Cooperar:** desde la ciudad de otro jugador puedes enviarle dinero (hasta el 50 % del tuyo).
- **Victoria:** gana el mayor **patrimonio** (dinero + valor de venta de los edificios) al acabar el tiempo (10, 20 o 30 min), o el primero que alcance la meta de la partida.

## Fase 2 (ideas, aún sin implementar)

Eventos aleatorios, misiones, comercio entre jugadores, más recursos y edificios, personalización, sonidos y chat.
