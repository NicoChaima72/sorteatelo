# Hermes — generador de contenido LLM-agnóstico detrás de una interfaz

Hermes (la herramienta de la autora para generar copy de marketing del fandom) abstrae el **proveedor LLM detrás de una interfaz** (un service), para poder cambiar de modelo con fricción mínima. La autora entra un input mínimo (objetivo: promocionar libro / empujar sorteo / interactuar; plataforma; tono); el sistema construye el prompt inyectando el **system prompt afinado** (voz del fandom K-pop/ARMY) + el contexto del libro, precio y sorteo (lo pone el sistema, no la autora); el LLM devuelve variaciones de copy + hashtags (opcional: ideas de imagen / guiones).

Razón: los modelos varían fuerte en costo y calidad, y el costo lo absorbe la mantención (es marginal al volumen). Acoplarse a un SDK de un proveedor encarece el cambio. La interfaz permite probar Gemini (plan gratis), Claude Haiku (~centavos/post, alta calidad) o DeepSeek/Kimi (muy baratos) sin reescribir Hermes. **Importante**: requiere acceso vía **API de pago por uso** — la cuenta gratis de claude.ai (chat) NO sirve.

## Consecuencias

- El proveedor LLM vive como service (`src/server/services/`) con una interfaz estable; el dominio de Hermes no conoce el SDK concreto.
- El **modelo por defecto** es **decisión abierta** (#4) — ver `docs/decisiones-abiertas.md`.
- Las API keys del proveedor van en env (`src/env.js` + `.env.example`), nunca en el repo.
- MVP = **"genera y copia"**: la autora publica a mano. El auto-posteo a redes queda **fuera de alcance** (requiere APIs/aprobaciones por plataforma; no se justifica al inicio).


---

> **RETIRADO (2026-07-17)**: Hermes salió del producto por decisión del usuario. Este ADR queda como
> registro histórico; no construir sobre él.
