import { useBlocker } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../ui";
import { FieldEditor } from "./FieldEditor";
import { label, pathLabel } from "./fields";
import type { AdminRecord, Json } from "../../lib/admin";
import { resourceSchemas, settingsSchemas } from "../../../shared/admin-schema";
export function AdminEditor({
  record,
  resource,
  title,
  pending,
  error,
  onSave,
  onClose,
}: {
  record: AdminRecord;
  resource: string;
  title: string;
  pending: boolean;
  error?: string;
  onSave: (r: AdminRecord) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(record)),
    [uploads, setUploads] = useState(0),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [section, setSection] = useState(""),
    [discard, setDiscard] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const busy = pending || uploads > 0,
    dirty = JSON.stringify(draft) !== JSON.stringify(record);
  const blocker = useBlocker(dirty || busy);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty || busy) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  const setting = resource === "settings",
    root = setting ? draft.value : draft,
    prefix = setting ? String(draft.key) : "";
  const entries = Object.entries(root as AdminRecord).filter(
    ([k]) =>
      ![
        "__existing",
        "__context",
        "revision",
        "created_at",
        "updated_at",
      ].includes(k) && !(resource === "stores" && k === "hours"),
  );
  const groups: Record<string, [string, Json][]> = {};
  for (const entry of entries) {
    const [k, v] = entry;
    const group =
      typeof v === "object" && v !== null
        ? k
        : /hero/.test(k)
          ? "hero"
          : /story|gifts|footer/.test(k)
            ? "page copy"
            : "general";
    (groups[group] ??= []).push(entry);
  }
  const selected = section in groups ? section : Object.keys(groups)[0];
  const close = () => {
    if (!busy) {
      if (dirty) setDiscard(true);
      else onClose();
    }
  };
  const focusPath = (path: string) => {
    const first = path.replace(prefix ? prefix + "." : "", "").split(".")[0];
    setSection(
      Object.keys(groups).find((g) => groups[g].some(([k]) => k === first)) ||
        Object.keys(groups)[0],
    );
    setTimeout(() => {
      const el =
        Array.from(
          form.current?.querySelectorAll<HTMLElement>("[data-path]") || [],
        ).find((e) => e.dataset.path === path) ||
        form.current?.querySelector<HTMLElement>(".admin-validation");
      let parent = el?.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      el?.focus();
      el?.scrollIntoView({ block: "center" });
    }, 0);
  };
  function submit() {
    if (busy) return;
    const parsed = setting
      ? settingsSchemas[draft.key as keyof typeof settingsSchemas]?.safeParse(
          draft.value,
        )
      : resourceSchemas[resource as keyof typeof resourceSchemas]?.safeParse(
          draft,
        );
    if (!parsed?.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed?.error.issues || []) {
        const path = [prefix, ...issue.path].filter((v) => v !== "").join(".");
        next[path] = issue.message;
      }
      if (!Object.keys(next).length)
        next[prefix] = "This record cannot be saved.";
      setErrors(next);
      focusPath(Object.keys(next)[0]);
      return;
    }
    setErrors({});
    onSave(
      setting
        ? {
            key: draft.key,
            value: parsed.data as Json,
            revision: draft.revision ?? 0,
          }
        : (parsed.data as AdminRecord),
    );
  }
  return (
    <Dialog
      className="admin-edit-dialog"
      title={`Edit ${title}`}
      onClose={close}
    >
      <form
        noValidate
        ref={form}
        className="admin-editor-layout"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <nav className="admin-editor-tabs" aria-label="Editor sections">
          {Object.keys(groups).map((g) => (
            <button
              type="button"
              key={g}
              aria-current={selected === g ? "page" : undefined}
              disabled={busy}
              onClick={() => setSection(g)}
            >
              {g === "data"
                ? resource === "products"
                  ? "Product details"
                  : "Details"
                : g === "variants"
                  ? "Packs & pricing"
                  : g === "inventory"
                    ? "Individual pieces"
                    : g === "experience"
                      ? "Catalogue & footer"
                      : g === "home"
                        ? "Homepage"
                        : label(g)}
            </button>
          ))}
        </nav>
        <div className="admin-editor-body">
          {record.__context && (
            <p className="notice">{String(record.__context)}</p>
          )}
          {(resource === "stores" ||
            (setting &&
              ["public", "commerce"].includes(String(draft.key)))) && (
            <p className="notice">
              Store contact details and pickup availability are shared with
              Storefront settings. Saving here updates both locations.
            </p>
          )}
          {Object.keys(errors).length > 0 && (
            <div role="alert" tabIndex={-1} className="admin-validation">
              <strong>Check these fields before saving</strong>
              {Object.entries(errors).map(([p, m]) => (
                <button type="button" key={p} onClick={() => focusPath(p)}>
                  {pathLabel(p) || "Record"}: {m}
                </button>
              ))}
            </div>
          )}
          {groups[selected]?.map(([k, v]) => (
            <FieldEditor
              key={k}
              value={v}
              path={[prefix, k].filter(Boolean).join(".")}
              errors={errors}
              locked={false}
              busy={busy}
              editingExisting={
                !!record.revision ||
                resource === "settings" ||
                !!record.created_at ||
                !!record.updated_at ||
                !!record.__existing
              }
              onUpload={(n) => setUploads((c) => Math.max(0, c + n))}
              onChange={(value) => {
                const next = { ...(root as AdminRecord), [k]: value };
                setDraft(setting ? { ...draft, value: next } : next);
              }}
            />
          ))}
        </div>
        <footer className="admin-editor-footer">
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {Object.keys(errors).length > 0 && (
            <button
              type="button"
              className="field-error"
              onClick={() => focusPath(Object.keys(errors)[0])}
            >
              Check {Object.keys(errors).length} invalid fields
            </button>
          )}
          <p role="status">
            {uploads
              ? "Uploading image…"
              : pending
                ? "Publishing changes…"
                : dirty
                  ? "Unsaved changes. Saving publishes immediately."
                  : "Changes publish when you save."}
          </p>
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            Save changes
          </button>
        </footer>
        {blocker.state === "blocked" && (
          <Dialog
            title={busy ? "Please wait" : "Leave with unsaved changes?"}
            onClose={() => blocker.reset()}
          >
            <p>
              {busy
                ? "Wait for the current upload or save to finish."
                : "Leaving this page will discard your unsaved changes."}
            </p>
            <button type="button" onClick={() => blocker.reset()}>
              Stay on this page
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => blocker.proceed()}
            >
              Discard and leave
            </button>
          </Dialog>
        )}
        {discard && (
          <Dialog
            title="Discard unsaved changes?"
            onClose={() => setDiscard(false)}
          >
            <p>Discard your unsaved changes?</p>
            <button type="button" onClick={() => setDiscard(false)}>
              Keep editing
            </button>
            <button type="button" onClick={onClose}>
              Discard changes
            </button>
          </Dialog>
        )}
      </form>
    </Dialog>
  );
}
