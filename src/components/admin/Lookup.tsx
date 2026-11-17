import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/request";
import { adminApi } from "../../lib/admin";
import { isDemo } from "../../lib/api";
export function Lookup({
  id,
  path,
  invalid,
  errorId,
  kind,
  value,
  onChange,
  disabled = false,
  label,
}: {
  id: string;
  path: string;
  invalid: boolean;
  errorId: string;
  kind: "products" | "collections" | "users";
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin", "lookup", kind, search, page, value],
    queryFn: async ({ signal }) => {
      if (isDemo) {
        const result = await adminApi.list(
          kind === "users" ? "admin_users" : kind,
          page,
          { q: search },
        );
        return {
          ...result,
          items: result.items.map((r) => ({
            id: String(r.id || r.user_id),
            label: String(
              (r.data as Record<string, unknown>)?.name || r.title || r.user_id,
            ),
          })),
        };
      }
      return api<{ items: { id: string; label: string }[]; total: number }>(
        `/api/admin/lookup?${new URLSearchParams({ kind, q: search, page: String(page), selected: value })}`,
        { signal },
      );
    },
    enabled: !disabled,
  });
  return (
    <div className="admin-lookup">
      <input
        aria-label={`Search ${label}`}
        type="search"
        value={search}
        disabled={disabled}
        placeholder={`Search ${label.toLowerCase()}…`}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <select
        id={id}
        data-path={path}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        aria-label={label}
        value={value}
        disabled={disabled || query.isPending}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose {label.toLowerCase()}</option>
        {value && !query.data?.items.some((i) => i.id === value) && (
          <option value={value}>{value}</option>
        )}
        {query.data?.items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
      {query.isError && (
        <p role="alert">
          Could not load choices.{" "}
          <button type="button" onClick={() => query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {!!query.data && query.data.total > 50 && (
        <div className="admin-inline-actions">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous choices
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            disabled={page * 50 >= query.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            More choices
          </button>
        </div>
      )}
    </div>
  );
}
