import { useId, useEffect, useRef, useState } from "react";
import { api } from "../../lib/request";
import { isDemo } from "../../lib/api";
import type { Json } from "../../lib/admin";
import {
  arrayItem,
  orderArray,
  arrayBounds,
  label,
  pathLabel,
  numericRule,
  imagePath,
  toIndiaInput,
  fromIndiaInput,
} from "./fields";
import { Lookup } from "./Lookup";
import { Photo } from "../Photo";
export function FieldEditor({
  value,
  path,
  onChange,
  errors,
  locked,
  busy,
  onUpload,
  editingExisting,
}: {
  value: Json;
  path: string;
  onChange: (value: Json) => void;
  errors: Record<string, string>;
  locked: boolean;
  busy: boolean;
  onUpload: (n: number) => void;
  editingExisting: boolean;
}) {
  const [uploadError, setUploadError] = useState("");
  const id = useId(),
    mounted = useRef(true),
    uploadController = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadController.current?.abort();
    };
  }, []);
  const key = path.split(".").at(-1)!;
  if (
    [
      "__existing",
      "revision",
      "created_at",
      "updated_at",
      "createdAt",
      "hours",
    ].includes(key) &&
    (key !== "hours" || typeof value === "object")
  )
    return null;
  const child = (v: Json, p: string, change: (v: Json) => void) => (
    <FieldEditor
      value={v}
      path={p}
      onChange={change}
      errors={errors}
      locked={locked}
      busy={busy}
      onUpload={onUpload}
      editingExisting={editingExisting}
    />
  );
  if (Array.isArray(value)) {
    const [min, max] = arrayBounds(path);
    return (
      <fieldset
        className="admin-array"
        tabIndex={-1}
        data-path={path}
        aria-invalid={!!errors[path] || undefined}
      >
        <legend>
          {label(key)} <small>({value.length})</small>
        </legend>
        {value.map((v, i) => (
          <details
            className="admin-array-row"
            key={typeof v === "object" && v && "id" in v ? String(v.id) : i}
            open={value.length < 5 || i === value.length - 1}
          >
            <summary>
              {typeof v === "object" && v
                ? String(
                    (v as Record<string, Json>).name ||
                      (v as Record<string, Json>).title ||
                      (v as Record<string, Json>).label ||
                      `Item ${i + 1}`,
                  )
                : `${label(key)} · Item ${i + 1}`}
            </summary>
            {child(v, `${path}.${i}`, (next) =>
              onChange(value.map((old, j) => (i === j ? next : old))),
            )}
            <div className="admin-inline-actions">
              <button
                type="button"
                disabled={busy || locked || i === 0}
                onClick={() => {
                  const next = [...value];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  onChange(orderArray(path, next));
                }}
                aria-label={`Move ${label(key)} item ${i + 1} up`}
              >
                Move up
              </button>
              <button
                type="button"
                disabled={busy || locked || i === value.length - 1}
                onClick={() => {
                  const next = [...value];
                  [next[i], next[i + 1]] = [next[i + 1], next[i]];
                  onChange(orderArray(path, next));
                }}
                aria-label={`Move ${label(key)} item ${i + 1} down`}
              >
                Move down
              </button>
              <button
                type="button"
                disabled={busy || locked || value.length <= min}
                onClick={() =>
                  onChange(
                    orderArray(
                      path,
                      value.filter((_, j) => i !== j),
                    ),
                  )
                }
                aria-label={`Remove ${path} item ${i + 1}`}
              >
                Remove
              </button>
            </div>
          </details>
        ))}
        <button
          type="button"
          className="text-button"
          disabled={busy || locked || value.length >= max}
          onClick={() =>
            onChange(orderArray(path, [...value, arrayItem(path)]))
          }
        >
          + Add {key}
        </button>
        {errors[path] && <p className="field-error">{errors[path]}</p>}
      </fieldset>
    );
  }
  if (value !== null && typeof value === "object")
    return (
      <div className="admin-field-group">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            {child(v, `${path}.${k}`, (next) =>
              onChange({ ...value, [k]: next }),
            )}
          </div>
        ))}
      </div>
    );
  const identity =
    key === "id" ||
    key === "key" ||
    (editingExisting && ["slug", "code", "user_id"].includes(key));
  const invalid = !!errors[path],
    errorId = id + "-error",
    fieldName = /^\d+$/.test(key)
      ? `${label(path.split(".").at(-2)!)} item ${Number(key) + 1}`
      : label(key);
  const common = {
    id,
    "data-path": path,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? errorId : undefined,
    disabled: busy || locked,
  };
  const numeric = numericRule(path),
    long =
      /description|body|paragraph|message|instructions|announcement|staff_notes/i.test(
        key,
      ) || path.includes("storyParagraphs.");
  const upload = async (file: File) => {
    setUploadError("");
    onUpload(1);
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api<{ url: string }>("/api/admin/upload", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      if (mounted.current) onChange(result.url);
    } catch (e) {
      if (mounted.current && !controller.signal.aborted)
        setUploadError(
          e instanceof Error ? e.message : "Upload failed. Try again.",
        );
    } finally {
      if (mounted.current) onUpload(-1);
    }
  };
  return (
    <div className={`admin-field ${long ? "wide" : ""}`}>
      {typeof value === "boolean" ? (
        <label className="check-label">
          <input
            {...common}
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
          />
          {fieldName}
        </label>
      ) : (
        <>
          <label htmlFor={id}>
            {fieldName}
            {identity && <small> · fixed reference</small>}
          </label>
          {identity ? (
            <input {...common} value={String(value ?? "")} readOnly />
          ) : key === "user_id" ||
            key === "collection_id" ||
            key === "productId" ||
            path.split(".").at(-2) === "product_ids" ? (
            <Lookup
              id={id}
              path={path}
              invalid={invalid}
              errorId={errorId}
              kind={
                key === "user_id"
                  ? "users"
                  : key === "collection_id"
                    ? "collections"
                    : "products"
              }
              value={String(value || "")}
              label={fieldName}
              disabled={busy || locked}
              onChange={onChange}
            />
          ) : key === "role" ? (
            <select
              {...common}
              value={String(value)}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
          ) : /^(starts_at|ends_at|expires_at)$/.test(key) ? (
            <input
              {...common}
              type="datetime-local"
              value={toIndiaInput(value)}
              onChange={(e) =>
                onChange(fromIndiaInput(e.target.value, key === "expires_at"))
              }
            />
          ) : long ? (
            <textarea
              {...common}
              value={String(value ?? "")}
              rows={key === "body" ? 8 : 3}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <input
              {...common}
              type={
                numeric.numeric
                  ? "number"
                  : /color/i.test(key)
                    ? "color"
                    : "text"
              }
              step={numeric.numeric ? numeric.step : undefined}
              min={numeric.numeric ? numeric.min : undefined}
              max={numeric.numeric ? numeric.max : undefined}
              value={String(value ?? "")}
              onChange={(e) =>
                onChange(
                  numeric.numeric
                    ? e.target.value === ""
                      ? ""
                      : Number(e.target.value)
                    : key === "code"
                      ? e.target.value.toUpperCase()
                      : e.target.value,
                )
              }
            />
          )}
        </>
      )}
      {invalid && (
        <p className="field-error" id={errorId}>
          {errors[path]}
        </p>
      )}
      {imagePath(path) && (
        <div className="admin-media">
          {value && (
            <Photo src={String(value)} alt={`${pathLabel(path)} preview`} />
          )}
          <label>
            Replace {fieldName.toLowerCase()}
            <input
              aria-label={`Upload ${pathLabel(path)}`}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={busy || locked || isDemo}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </label>
          {isDemo && (
            <small>Uploads are available in the connected store.</small>
          )}
          <p role="alert">{uploadError}</p>
        </div>
      )}
    </div>
  );
}
