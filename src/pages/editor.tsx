import { type GetServerSideProps } from "next";
import Head from "next/head";

import { EditorPageBuilder } from "~/components/editor/editor-pagebuilder";
import { getPropsEditor, type PropsEditor } from "~/server/storefront/getEditorProps";

/**
 * Editor visual del page builder (catálogo-v2 F09/F10, ADR-0016). Vive en el SUBDOMINIO del tenant
 * (`<slug>.<apex>/editor`, D6): la preview del Borrador se sirve same-origin (`/?preview=<token>`), el
 * tenant se resuelve por host (I1) y la sesión wildcard ya opera acá. Gate en `getServerSideProps`
 * (`getPropsEditor`): sin permiso ⇒ 404 neutral. `noindex` — no forma parte del HTML público (I5).
 */
export default function EditorPage(props: PropsEditor) {
  return (
    <>
      <Head>
        <title>Editar mi tienda · Sortéatelo</title>
        <meta name="robots" content="noindex" />
      </Head>
      <EditorPageBuilder slug={props.slug} previewToken={props.previewToken} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PropsEditor> = (ctx) =>
  getPropsEditor(ctx);
