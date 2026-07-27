# Modalidades de rifa — Roadmap

Catálogo completo de modalidades que Boletera puede ofrecer. Las modalidades
**Tier 1** ya están (o se están) implementadas. **Tier 2** y **Tier 3** son
ideas validadas en mercado a implementar en orden de demanda.

---

## 🎟️ Estructura del sorteo

### 1. Clásica *(Tier 1 — implementado)*

- 500 boletas × 20 números cada una (4 dígitos, 0000‑9999)
- Vendes la boleta como unidad ($20.000 por defecto)
- Costo por chance: $1.000 (= $20.000 / 20)
- **Ideal para:** TVs, electrodomésticos, viajes, premios medianos.

### 2. Premium *(Tier 1 — en construcción)*

- N números individuales (configurable: **4 o 5 dígitos**)
- 5 dígitos → 100.000 números (ideal premios grandes: moto, carro, casa)
- 4 dígitos → 10.000 números (ideal premios medianos con más entradas)
- Cada número = 1 ticket independiente (no hay "boletas con 20 números")
- Se venden en **paquetes** de N números (30/40/50/100 etc.)
- Mínimo de compra configurable (por defecto el paquete más chico)
- **Inspirado en:** rifas de moto en Facebook colombiano. Barrera de
  entrada baja ($12.000 vs $20.000 de la clásica) sin sacrificar el
  recaudo potencial total.

### 3. Express *(Tier 1 — pendiente)*

- 100 números (2 dígitos, 00‑99) o 1.000 números (3 dígitos)
- 1 número por ticket
- Sorteo en 24‑72 horas
- **Ideal para:** mercados pequeños, bonos de gasolina, días de spa,
  fines de semana rápidos.

### 4. Multi‑sorteo *(implementado)*

Una rifa, varios premios con fechas distintas. Cada premio se sortea por
separado. Ya se soporta nativamente — solo hay que destacarlo como modo en
la UI.

### 5. Bote Acumulado *(Tier 3)*

Si la rifa no alcanza el umbral, el premio "rueda" al siguiente periodo
y crece. Requiere lógica de continuidad entre rifas — complejo. Aplica
para loterías comunitarias con sorteo semanal.

### 6. Año Completo *(Tier 3)*

Una boleta participa en 12 sorteos (uno por mes durante un año). Buena
para iglesias, clubes deportivos, fundaciones. Modelo recurrente sin
necesidad de pasarela de pago: el cliente paga una vez por las 12.

---

## 🛒 Forma de venta

### 7. Boleta Unitaria *(implementado)*

Compras una boleta a precio fijo. Modo por defecto del classic.

### 8. Paquetes *(Tier 1 — en construcción, va con Premium)*

Compras N números sueltos en un pack (estilo Facebook moto):

```
Paquete 30 números → $12.000
Paquete 50 números → $20.000
Paquete 100 números → $36.000 (con descuento)
```

Mínimo de compra: el paquete más chico. Los números se asignan
aleatoriamente del pool disponible.

### 9. Elige Tu Suerte *(Tier 3)*

El cliente escoge sus propios números (como Baloto). Requiere UI extra de
selección y bloqueo de números ya escogidos por otros. Aumenta el
engagement: la gente apuesta por sus números "de la suerte" (cumpleaños,
aniversarios, etc.).

### 10. Rangos *(Tier 3)*

Compras un rango contiguo (ej. 100‑199 son 100 números). Útil para
compradores mayoristas o socios que se llevan un bloque. Mecánica
distinta a paquetes: en rangos sabes EXACTAMENTE qué números son tuyos.

### 11. Cuotas *(Tier 3)*

Pago parcial hasta completar el valor. Útil para premios caros (carro,
moto). Riesgo de impago: necesitas política clara de qué pasa si el
cliente abandona después de la primera cuota.

### 12. Suscripción mensual *(Tier 3)*

Pago automático recurrente que mantiene al cliente activo en el sorteo
del mes. Requiere pasarela de pago real (Wompi/Stripe) — fuera del
alcance del MVP.

---

## 🎁 Mecánicas extra (combinables con cualquier estructura)

### 13. Premio Progresivo *(Tier 2)*

El premio aumenta según el % vendido:

```
Vendemos 60% → Premio: $3.000.000
Vendemos 80% → Premio: $4.000.000
Vendemos 100% → Premio: $5.000.000
```

Crea urgencia y motiva a los vendedores a empujar el último 20%.

### 14. Doble o Nada *(Tier 3)*

El ganador puede "doblar" su premio respondiendo una trivia o lanzando
dado en vivo durante el sorteo. Engagement de show, no escalable a muchas
rifas a la vez.

### 15. Refiérete y Gana *(Tier 2)*

Cada cliente recibe un código de referido. Si invita a 3 amigos, gana 1
boleta gratis. El vendedor original también recibe % de la venta del
referido. Multiplica la viralidad sin gasto en publicidad.

### 16. Familia Premiada *(Tier 3)*

Una boleta da N chances con nombres separados (papá, mamá, hijo). Cada
miembro tiene su propio número. Cualquiera puede ganar. Excelente para
rifas familiares (electrodomésticos, viajes).

### 17. Garantía de Sorteo *(parcialmente implementado)*

"Si no llegamos al umbral, te devolvemos el 100% en 48h". Ya cubrimos la
cancelación con email empático y datos de reembolso. Falta exponerlo como
sello visible en la rifa pública.

### 18. Combo de Premios *(Tier 3)*

El ganador puede elegir entre A, B o C (mismo valor). Útil cuando los
gustos varían: "ganas $5M en efectivo O un Apple Watch O un viaje a San
Andrés".

---

## Prioridad de implementación

| Tier | Modalidades | Estado |
|---|---|---|
| **Tier 1** (urgente) | 1, 2, 3, 4, 7, 8, 17 | Clásica, Multi y Garantía hechos. Premium + Express + Paquetes en construcción. |
| **Tier 2** (medio plazo) | 13, 15 | Pendiente. Bajo esfuerzo, alto retorno marketing. |
| **Tier 3** (futuro) | 5, 6, 9, 10, 11, 12, 14, 16, 18 | Solo se construye cuando algún cliente concreto lo pida. |

## Reglas de diseño

1. **Una rifa tiene UN modo** (`classic` | `package` | `express`). No se
   mezclan. Si necesitas dos modos, son dos rifas separadas.
2. **Las mecánicas extra** (Tier 2/3) se pueden combinar con cualquier
   modo. Premio Progresivo + Premium = válido; Refiérete + Express = válido.
3. **El modo es inmutable** después de crear la rifa (mismo nivel de
   inmutabilidad que el precio de boleta).
4. **Templates en la UI** ocultan la complejidad: el admin elige
   "Clásica" o "Premium" y el formulario precarga valores sensatos.
