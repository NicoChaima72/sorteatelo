import {
  ActionIcon,
  Box,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBold,
  IconHighlight,
  IconItalic,
  IconLetterCase,
  IconLink,
  IconLinkOff,
  IconPalette,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { estiloMarcasRun } from "~/components/storefront/runs-texto";
import {
  aplicarLink,
  limpiarRichTexto,
  quitarLink,
  textoPlano,
  toggleMarca,
  tramosARichTexto,
} from "~/lib/pagebuilder/runs-edicion";
import {
  CTA_ANCLAS,
  slugPagina,
  urlLinkSegura,
  type DestinoLink,
  type MarcaRun,
  type MarkDefLink,
  type RichTexto,
} from "~/lib/pagebuilder/widgets";

/**
 * `EditorRuns` (Tanda 3 F03/D6): editor de texto rico contenteditable PLAINTEXT-ONLY para los campos
 * `RichTexto` del panel (hero.titulo/subtitulo, perfil_autora.bio). Reemplaza el TextInput/Textarea.
 *
 * Reglas duras (I-U1/I-U10):
 * - Contenteditable NATIVO — SIN Tiptap/Lexical/ProseMirror (caso acotado: marcas planas). El DOM lo
 *   siembra el componente IMPERATIVAMENTE (`document.createElement` + `textContent`), JAMÁS con
 *   `dangerouslySetInnerHTML` ni `innerHTML` con contenido del tenant.
 * - Pegar SIEMPRE pasa por `text/plain` (nunca HTML pegado).
 * - Marcas/links se aplican en el modelo de RUNS (helpers puros `runs-edicion.ts`), no con Range surgery
 *   frágil: se serializa DOM→runs, se transforma, se RE-SIEMBRA el DOM y se restaura la selección.
 * - Antes de emitir `onChange`, el resultado PARSEA contra el MISMO `RichTextoSchema` (client-side); el
 *   server RE-VALIDA (I3). Si no parsea (p.ej. quedó vacío) no se emite.
 */

/** Marcas de la toolbar curada (D6): la directiva pide negrita/énfasis/acento/resaltado/escala. */
const BOTONES_MARCA: { marca: MarcaRun; label: string; Icono: typeof IconBold }[] = [
  { marca: "fuerte", label: "Negrita", Icono: IconBold },
  { marca: "enfasis", label: "Énfasis (itálica)", Icono: IconItalic },
  { marca: "acento", label: "Color de acento", Icono: IconPalette },
  { marca: "resaltado", label: "Resaltado", Icono: IconHighlight },
  { marca: "escala_lg", label: "Más grande", Icono: IconLetterCase },
];

/** Un tramo plano leído del DOM (texto + marcas + link id). */
interface Tramo {
  t: string;
  m?: MarcaRun[];
  link?: string;
}

/** Parsea el atributo `data-m` ("acento fuerte") a un array de MarcaRun válidas. */
function leerMarcas(el: HTMLElement): MarcaRun[] | undefined {
  const raw = el.getAttribute("data-m");
  if (!raw) return undefined;
  const validas = raw.split(/\s+/).filter((m): m is MarcaRun => (MARCAS_VALIDAS as readonly string[]).includes(m));
  return validas.length ? validas : undefined;
}
const MARCAS_VALIDAS: readonly string[] = ["fuerte", "enfasis", "acento", "resaltado", "marca", "gradiente", "escala_lg", "escala_xl"];

/** Lee los tramos planos del contenedor contenteditable (text nodes + spans de 1er nivel). */
function leerTramos(container: HTMLElement): Tramo[] {
  const tramos: Tramo[] = [];
  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? "";
      if (t) tramos.push({ t });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const t = el.textContent ?? "";
      if (t) {
        const link = el.getAttribute("data-link") ?? undefined;
        tramos.push({ t, m: leerMarcas(el), ...(link ? { link } : {}) });
      }
    }
  });
  return tramos;
}

/** Siembra el contenteditable desde un RichTexto (imperativo, sin innerHTML). */
function sembrar(container: HTMLElement, rico: RichTexto) {
  container.textContent = ""; // limpia
  for (const run of rico.children) {
    if (!run.m && run.link === undefined) {
      container.appendChild(document.createTextNode(run.t));
      continue;
    }
    const span = document.createElement("span");
    span.textContent = run.t;
    if (run.m) {
      span.setAttribute("data-m", run.m.join(" "));
      Object.assign(span.style, estiloMarcasRun(run.m));
    }
    if (run.link !== undefined) {
      span.setAttribute("data-link", run.link);
      span.style.textDecoration = "underline";
    }
    container.appendChild(span);
  }
  if (rico.children.length === 0) container.appendChild(document.createTextNode(""));
}

/** Offsets [inicio, fin) de la selección dentro del contenedor (char offsets del texto plano). */
function offsetsDeSeleccion(container: HTMLElement): { inicio: number; fin: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;
  const offsetHasta = (node: Node, offset: number): number => {
    let total = 0;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let n = walker.nextNode();
    while (n) {
      if (n === node) return total + offset;
      total += (n.textContent ?? "").length;
      n = walker.nextNode();
    }
    return total;
  };
  const a = offsetHasta(range.startContainer, range.startOffset);
  const b = offsetHasta(range.endContainer, range.endOffset);
  return { inicio: Math.min(a, b), fin: Math.max(a, b) };
}

/** Restaura una selección [inicio, fin) por char offset tras re-sembrar el DOM. */
function restaurarSeleccion(container: HTMLElement, inicio: number, fin: number) {
  const posDe = (offset: number): { node: Node; offset: number } => {
    let total = 0;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let n = walker.nextNode();
    let ultimo: Node = container;
    while (n) {
      const len = (n.textContent ?? "").length;
      if (total + len >= offset) return { node: n, offset: offset - total };
      total += len;
      ultimo = n;
      n = walker.nextNode();
    }
    return { node: ultimo, offset: (ultimo.textContent ?? "").length };
  };
  const sel = window.getSelection();
  if (!sel) return;
  const a = posDe(inicio);
  const b = posDe(fin);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function EditorRuns({
  value,
  onChange,
  label,
  placeholder,
  minRows = 2,
}: {
  value: RichTexto | undefined;
  onChange: (rico: RichTexto | undefined) => void;
  label?: string;
  placeholder?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const markDefsRef = useRef<MarkDefLink[]>(value?.markDefs ? [...value.markDefs] : []);
  const ultimoEmitido = useRef<string>(""); // JSON del último valor emitido, para no re-sembrar sobre él
  const [linkAbierto, linkModal] = useDisclosure(false);
  const [seleccionLink, setSeleccionLink] = useState<{ inicio: number; fin: number } | null>(null);

  // Valor por defecto para un campo vacío (un run con un espacio, para que el contenteditable tenga altura).
  const valorSeguro = useMemo<RichTexto>(
    () => value ?? { children: [{ t: "" }] },
    [value],
  );

  // Siembra/re-siembra el DOM cuando el valor cambia DESDE AFUERA (no cuando lo emitimos nosotros).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const json = JSON.stringify(value ?? null);
    if (json === ultimoEmitido.current) return; // el cambio vino de este editor ⇒ no clobber
    markDefsRef.current = value?.markDefs ? [...value.markDefs] : [];
    sembrar(el, value ?? { children: [{ t: "" }] });
  }, [value]);

  /** Serializa el DOM actual a RichTexto (parseado) y emite onChange. NO re-siembra (respeta el cursor). */
  const emitir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rico = tramosARichTexto(leerTramos(el), markDefsRef.current);
    // Vacío ⇒ el campo se limpia (undefined) para que el schema opcional lo acepte.
    const salida = rico ?? undefined;
    const json = JSON.stringify(salida ?? null);
    ultimoEmitido.current = json;
    onChange(salida);
  }, [onChange]);

  /** Aplica un TOGGLE de marca sobre la selección (serializa → transforma → re-siembra → restaura). */
  const aplicarMarca = useCallback(
    (marca: MarcaRun) => {
      const el = ref.current;
      if (!el) return;
      const sel = offsetsDeSeleccion(el);
      if (!sel || sel.inicio >= sel.fin) return; // sin selección ⇒ no-op
      const actual = tramosARichTexto(leerTramos(el), markDefsRef.current) ?? limpiarRichTexto(valorSeguro);
      const nuevo = toggleMarca(actual, sel.inicio, sel.fin, marca);
      markDefsRef.current = nuevo.markDefs ? [...nuevo.markDefs] : [];
      sembrar(el, nuevo);
      restaurarSeleccion(el, sel.inicio, sel.fin);
      ultimoEmitido.current = JSON.stringify(nuevo);
      onChange(nuevo);
    },
    [onChange, valorSeguro],
  );

  /** Abre el diálogo de link con la selección actual capturada. */
  const abrirLink = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const sel = offsetsDeSeleccion(el);
    if (!sel || sel.inicio >= sel.fin) return;
    setSeleccionLink(sel);
    linkModal.open();
  }, [linkModal]);

  /** Confirma el link del diálogo: aplica el destino tipado sobre la selección guardada. */
  const confirmarLink = useCallback(
    (destino: DestinoLink) => {
      const el = ref.current;
      if (!el || !seleccionLink) return;
      const actual = tramosARichTexto(leerTramos(el), markDefsRef.current) ?? limpiarRichTexto(valorSeguro);
      const id = `l${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
      const nuevo = aplicarLink(actual, seleccionLink.inicio, seleccionLink.fin, id, destino);
      markDefsRef.current = nuevo.markDefs ? [...nuevo.markDefs] : [];
      sembrar(el, nuevo);
      ultimoEmitido.current = JSON.stringify(nuevo);
      onChange(nuevo);
      linkModal.close();
      setSeleccionLink(null);
    },
    [onChange, seleccionLink, valorSeguro, linkModal],
  );

  /** Quita el link de la selección actual. */
  const quitarLinkSeleccion = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const sel = offsetsDeSeleccion(el);
    if (!sel || sel.inicio >= sel.fin) return;
    const actual = tramosARichTexto(leerTramos(el), markDefsRef.current);
    if (!actual) return;
    const nuevo = quitarLink(actual, sel.inicio, sel.fin);
    markDefsRef.current = nuevo.markDefs ? [...nuevo.markDefs] : [];
    sembrar(el, nuevo);
    restaurarSeleccion(el, sel.inicio, sel.fin);
    ultimoEmitido.current = JSON.stringify(nuevo);
    onChange(nuevo);
  }, [onChange]);

  /** Pegar SIEMPRE como texto plano (nunca HTML pegado, I-U1). */
  const onPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const texto = e.clipboardData.getData("text/plain");
    // Inserta texto plano en la posición del cursor (sin marcas).
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(texto));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const vacio = textoPlano(valorSeguro.children).length === 0;

  return (
    <Box>
      {label && (
        <Text size="sm" fw={500} mb={4}>
          {label}
        </Text>
      )}
      <Box
        style={{
          border: "1px solid var(--mantine-color-default-border)",
          borderRadius: "var(--mantine-radius-sm)",
          overflow: "hidden",
        }}
      >
        <Group
          gap={2}
          p={4}
          wrap="nowrap"
          style={{ borderBottom: "1px solid var(--mantine-color-default-border)", background: "var(--mantine-color-gray-0)" }}
        >
          {BOTONES_MARCA.map(({ marca, label: l, Icono }) => (
            <Tooltip key={marca} label={l} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={l}
                onMouseDown={(e) => e.preventDefault()} // no perder la selección al clickear
                onClick={() => aplicarMarca(marca)}
              >
                <Icono className="size-4" />
              </ActionIcon>
            </Tooltip>
          ))}
          <Tooltip label="Insertar enlace" withArrow>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Insertar enlace" onMouseDown={(e) => e.preventDefault()} onClick={abrirLink}>
              <IconLink className="size-4" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Quitar enlace" withArrow>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Quitar enlace" onMouseDown={(e) => e.preventDefault()} onClick={quitarLinkSeleccion}>
              <IconLinkOff className="size-4" />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Box style={{ position: "relative" }}>
          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label={label ?? "Texto"}
            aria-multiline="true"
            onInput={emitir}
            onBlur={emitir}
            onPaste={onPaste}
            style={{
              minHeight: minRows * 24 + 8,
              padding: "8px 10px",
              outline: "none",
              fontSize: "var(--mantine-font-size-sm)",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          />
          {vacio && placeholder && (
            <Text
              size="sm"
              c="dimmed"
              style={{ position: "absolute", top: 8, left: 10, pointerEvents: "none" }}
            >
              {placeholder}
            </Text>
          )}
        </Box>
      </Box>
      <DialogoLink opened={linkAbierto} onClose={() => { linkModal.close(); setSeleccionLink(null); }} onConfirmar={confirmarLink} />
    </Box>
  );
}

/** Diálogo de link tipado (D6): tipo (ancla|pagina|url) + destino según la rama, validado por el schema. */
function DialogoLink({
  opened,
  onClose,
  onConfirmar,
}: {
  opened: boolean;
  onClose: () => void;
  onConfirmar: (destino: DestinoLink) => void;
}) {
  const [tipo, setTipo] = useState<"ancla" | "pagina" | "url">("ancla");
  const [ancla, setAncla] = useState<string>(CTA_ANCLAS[0]);
  const [slug, setSlug] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const confirmar = () => {
    setError(null);
    let destino: DestinoLink;
    if (tipo === "ancla") {
      destino = { tipo: "ancla", ancla: ancla as (typeof CTA_ANCLAS)[number] };
    } else if (tipo === "pagina") {
      if (!slugPagina.safeParse(slug.trim()).success) return setError("Slug inválido (minúsculas y guiones).");
      destino = { tipo: "pagina", slug: slug.trim() };
    } else {
      if (!urlLinkSegura.safeParse(url.trim()).success) return setError("Debe ser una URL https válida.");
      destino = { tipo: "url", url: url.trim() };
    }
    onConfirmar(destino);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Insertar enlace" centered size="sm">
      <Stack gap="sm">
        <Select
          label="Tipo de enlace"
          data={[
            { value: "ancla", label: "Sección de esta página" },
            { value: "pagina", label: "Otra página" },
            { value: "url", label: "Enlace externo (https)" },
          ]}
          value={tipo}
          onChange={(v) => v && setTipo(v as "ancla" | "pagina" | "url")}
        />
        {tipo === "ancla" && (
          <Select
            label="Sección"
            data={CTA_ANCLAS.map((a) => ({ value: a, label: a }))}
            value={ancla}
            onChange={(v) => v && setAncla(v)}
          />
        )}
        {tipo === "pagina" && (
          <TextInput
            label="Slug de la página"
            placeholder="sobre-mi"
            value={slug}
            onChange={(e) => setSlug(e.currentTarget.value)}
          />
        )}
        {tipo === "url" && (
          <TextInput
            label="URL (https)"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
          />
        )}
        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" size="xs" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="xs" onClick={confirmar}>
            Insertar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
